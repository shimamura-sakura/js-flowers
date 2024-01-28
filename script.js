'use strict';
const scripts = {};
const textDec = new TextDecoder('windows-31j', { fatal: true });

const INDEX_VOICE = 0;
const INDEX_BGM = 1;
const INDEX_SE = 2;

class ScriptReader {
    getState() {
        return { script: this.script, offset: this.offset };
    }
    setState({ script, offset }) {
        if (script != this.script) {
            const dataStr = atob(scripts[script]);
            const dataArr = this.data = new Uint8Array(dataStr.length);
            const dataLen = dataArr.length;
            for (var i = 0; i < dataLen; i++)
                dataArr[i] = dataStr.charCodeAt(i);
            this.script = script;
        }
        this.offset = offset;
    }
    get notEOF() { return this.offset < this.data.length; }
    cmd() {
        const cmd = this.data[this.offset++];
        const len = this.data[this.offset++] - 2;
        return [cmd, len];
    }
    seq(desc) {
        const ret = [];
        for (const c of desc) {
            var sgn = false, num = 0, len, max;
            switch (c) {
                case 'b': case 'c': // byte or char
                    sgn = true;
                case 'B': case 'C':
                    len = 1; break;
                case 'w': case 's': // word or short
                    sgn = true;
                case 'W': case 'S':
                    len = 2; break;
                case 'd': case 'i': // dword or int
                    sgn = true;
                case 'D': case 'I':
                    len = 4; break;
                default:            // skip int(c) bytes
                    this.offset += parseInt(c); continue;
            }
            for (var i = 0; i < len; i++)
                num += this.data[this.offset++] << (i * 8);
            if (sgn)
                if ((max = 1 << (len * 8)) & (num << 1)) num -= max;
            ret.push(num);
        }
        return ret;
    }
    str(len) {
        var idx, slice = this.data.slice(this.offset, this.offset + len);
        if ((idx = slice.indexOf(0)) != -1) slice = slice.slice(0, idx);
        const str = textDec.decode(slice, { stream: false });
        this.offset += len;
        return str;
    }
}
class Interpreter {
    vars = {};
    sels = [];
    dlgName = null;
    constructor (fs, sound, scene, textWnd, eleVars) {
        this.fs = fs;
        this.sound = sound;
        this.scene = scene;
        this.textWnd = textWnd;
        this.eleVars = eleVars;
        this.script = new ScriptReader();
    }
    getState() {
        return { script: this.script.getState(), vars: this.vars, sels: this.sels };
    }
    setState() {

    }
    setScript(name) {
        this.script.setState({ script: name, offset: 0 });
    }
    updateEleVars(updateStr) {
        const segs = [];
        for (const key in this.vars) {
            segs.push(`[${key}] = ${this.vars[key]}`);
        }
        const str = segs.join(', ');
        if (updateStr)
            this.eleVars.value = str + '; last change: ' + updateStr;
        else
            this.eleVars.value = str;
    }
    *waitImgs() {
        while (!this.scene.allImgReady())
            yield;
        console.log('image loaded');
    }
    afterDialog() {
        this.textWnd.setText(null, null);
        this.sound.stop(INDEX_VOICE);
    }
    next() {
        while (this.script.notEOF) {
            const [cmdCode, cmdLen] = this.script.cmd();
            switch (cmdCode) {
                case 0x00: {
                    const [strlen] = this.script.seq('1C');
                    const str = this.script.str(strlen);
                    console.log('str', str);
                    if (str.startsWith('＃'))
                        this.dlgName = str.replace('＃', '');
                    else {
                        this.textWnd.setText(this.dlgName, str);
                        this.dlgName = null;
                        return ['DIALOG'];
                    }
                    break;
                }
                case 0x01: {
                    this.script.offset += cmdLen;
                    console.warn('script exit');
                    return ['EXIT'];
                }
                case 0x02: {
                    const [strlen] = this.script.seq('1C');
                    const filename = this.script.str(strlen);
                    console.log('script', filename);
                    this.setScript(filename);
                    break;
                }
                case 0x04: {
                    const [index, value] = this.script.seq('Si');
                    console.log(`v[${index}] :=`, value, '// prev', this.vars[index]);
                    this.vars[index] = value;
                    this.updateEleVars(`[${index}] = ${value}`);
                    break;
                }
                case 0x05: {
                    const [index, value] = this.script.seq('Si');
                    console.log(`v[${index}] +=`, value, '// prev', this.vars[index]);
                    this.vars[index] += value;
                    this.updateEleVars(`[${index}] += ${value}`);
                    break;
                }
                case 0x06: {
                    const [index, value, offset] = this.script.seq('2S2iI');
                    console.log(`if v[${index}] ==`, value, 'goto', offset, '// =', this.vars[index]);
                    if (this.vars[index] == value) {
                        this.script.offset = offset;
                        console.log('jump is taken');
                    }
                    break;
                }
                case 0x08: {
                    const [index, value, offset] = this.script.seq('2S2iI');
                    console.log(`if v[${index}] >=`, value, 'goto', offset, '// =', this.vars[index]);
                    if (this.vars[index] >= value) {
                        this.script.offset = offset;
                        console.log('jump is taken');
                    }
                    break;
                }
                case 0x09: {
                    const [index, value, offset] = this.script.seq('2S2iI');
                    console.log(`if v[${index}] <=`, value, 'goto', offset, '// =', this.vars[index]);
                    if (this.vars[index] <= value) {
                        this.script.offset = offset;
                        console.log('jump is taken');
                    }
                    break;
                }
                case 0x0C: {
                    const [dlgSeq] = this.script.seq('2I');
                    console.log('dlg seq', dlgSeq);
                    break;
                }
                case 0x0D: {
                    const [offset] = this.script.seq('2I');
                    console.log('goto', offset);
                    this.script.offset = offset;
                    break;
                }
                case 0x0E: {
                    const [duration] = this.script.seq('2I');
                    console.log('wait', duration);
                    return ['WAIT', duration];
                }
                case 0x0F:
                case 0x10: {
                    const [strlen] = this.script.seq('1C');
                    const filename = this.script.str(strlen);
                    console.log('bg', filename);
                    this.scene.bg.setImage(this.fs.bg(filename));
                    this.scene.fg.forEach(l => l.setEmpty());
                    return ['WAIT_IMG'];
                }
                case 0x11: {
                    this.script.offset += cmdLen;
                    console.log('fg[*] clear');
                    this.scene.fg.forEach(l => l.setEmpty());
                    break;
                }
                case 0x12:
                case 0x9C: {
                    const [layer, strlen] = this.script.seq('CC');
                    const filename = this.script.str(strlen);
                    console.log(`fg[${layer}]`, filename);
                    this.scene.fg[layer].setImage(this.fs.fg(filename));
                    return ['WAIT_IMG'];
                }
                case 0x13: {
                    const [layer, scale, xMid, yTop] = this.script.seq('CCss');
                    console.log(`fg[${layer}] opts`, scale, xMid, yTop);
                    this.scene.fg[layer].setImageOpts([xMid, yTop, scale, scale, 255]);
                    break;
                }
                case 0x14: {
                    const [duration] = this.script.seq('2I');
                    console.log('fade', duration);
                    this.scene.initFade(duration);
                    return ['FADE', duration];
                    // this.scene.stopFade();
                }
                case 0x16: {
                    const [b, g, r] = this.script.seq('2CCC1');
                    console.log('bg rgb', r, g, b);
                    this.scene.bg.setColor(r, g, b);
                    this.scene.fg.forEach(l => l.setEmpty());
                    break;
                }
                case 0x1C: {
                    this.script.offset += cmdLen;
                    console.log('sel beg');
                    this.sels.length = 0;
                    break;
                }
                case 0x1D: {
                    const [strlen, offset] = this.script.seq('SI');
                    const str = this.script.str(strlen);
                    console.log('sel', str, ': goto', offset);
                    this.sels.push({ offset, str });
                    break;
                }
                case 0x1B: {
                    this.script.offset += cmdLen; // choice num
                    console.log('sel end');
                    this.textWnd.setSels(this.sels);
                    return ['SELECT'];
                    // this.textWnd.setSels(null);
                }
                case 0x21: {
                    const [endNo] = this.script.seq('S');
                    console.log('ending', endNo);
                    break;
                }
                case 0x22: {
                    const [loop, strlen] = this.script.seq('1C3C');
                    const name = this.script.str(strlen);
                    console.log('bgm', name, 'loop', loop);
                    return ['SOUND', INDEX_BGM, this.fs.bgm(name), loop, 0];
                }
                case 0x23: {
                    this.script.offset += cmdLen;
                    console.log('bgm stop');
                    this.sound.stop(INDEX_BGM);
                    break;
                }
                case 0x24: {
                    const [duration] = this.script.seq('2I');
                    console.log('bgm fade out', duration);
                    this.sound.fadeOut(INDEX_BGM, duration);
                    break;
                }
                case 0x25: {
                    const [loop, duration, strlen] = this.script.seq('1CIC3');
                    const name = this.script.str(strlen);
                    console.log('bgm', name, 'fade in', duration, 'loop', loop);
                    return ['SOUND', INDEX_BGM, this.fs.bgm(name), loop, duration];
                }
                case 0x27: {
                    const [loop, strlen] = this.script.seq('1C3C');
                    const name = this.script.str(strlen);
                    console.log('voice', name, 'loop', loop);
                    return ['SOUND', INDEX_VOICE, this.fs.voice(name), loop, 0];
                }
                case 0x28: {
                    const [loop, strlen] = this.script.seq('1C3C');
                    const name = this.script.str(strlen);
                    console.log('se', name, 'loop', loop);
                    return ['SOUND', INDEX_SE, this.fs.se(name), loop, 0];
                }
                case 0x29: {
                    this.script.offset += cmdLen;
                    console.log('se stop');
                    this.sound.stop(INDEX_SE);
                    break;
                }
                case 0x2A: {
                    this.script.offset += cmdLen;
                    console.log('voice stop');
                    this.sound.stop(INDEX_VOICE);
                    break;
                }
                case 0x2D: {
                    const [loop, duration, strlen] = this.script.seq('1CIC3');
                    const name = this.script.str(strlen);
                    console.log('se', name, 'fade in', duration, 'loop', loop);
                    return ['SOUND', INDEX_SE, this.fs.se(name), loop, duration];
                }
                case 0x2C: {
                    const [duration] = this.script.seq('2I');
                    console.log('se fade out', duration);
                    this.sound.fadeOut(INDEX_SE, duration);
                    break;
                }
                case 0x3B: {
                    const [_, offset] = this.script.seq('SI');
                    console.log('if (cleared) goto', offset);
                    if (true) {
                        this.script.offset = offset;
                        console.log('jump is taken');
                    }
                    break;
                }
                case 0x3F: {
                    const [strlen] = this.script.seq('1C');
                    const str = this.script.str(strlen);
                    console.log('log', str);
                    break;
                }
                case 0x40: {
                    const [show] = this.script.seq('S');
                    console.log('dlg show', !!show);
                    this.textWnd.show = !!show;
                    break;
                }
                case 0x54: {
                    const [mode] = this.script.seq('S');
                    console.log('wait click mode', mode);
                    return ['CLICK', mode];
                }
                case 0x72: {
                    const [layer, xMid, yTop, xScale, yScale, alpha, repeats] = this.script.seq('1Csssss2S2');
                    console.log('fg', layer, 'anim a pos', xMid, yTop,
                        'scale', xScale, yScale, 'alpha', alpha, 'reps', repeats);
                    this.scene.fa[layer].setOptA([xMid, yTop, xScale, yScale, alpha], repeats);
                    break;
                }
                case 0x73: {
                    const [layer, xMid, yTop, xScale, yScale, alpha, duration] = this.script.seq('C1sssss2S2');
                    console.log('fg', layer, 'anim b pos', xMid, yTop,
                        'scale', xScale, yScale, 'alpha', alpha, 'duration', duration);
                    this.scene.fa[layer].setOptB([xMid, yTop, xScale, yScale, alpha], duration);
                    break;
                }
                case 0x74: {
                    this.script.offset += cmdLen;
                    console.log('fg anim start');
                    this.scene.startAnim();
                    break;
                }
                case 0x75: {
                    this.script.offset += cmdLen;
                    console.log('fg anim stop');
                    this.scene.stopAnim();
                    break;
                }
                case 0xB2: {
                    const [videoNo] = this.script.seq('2S2');
                    console.warn('todo play video', videoNo);
                    break;
                }
                case 0xB3: {
                    const [mode] = this.script.seq('1C');
                    console.warn('todo play credit mode', mode);
                    break;
                }
                case 0xB4: {
                    const [strlen] = this.script.seq('1C');
                    const filename = this.script.str(strlen);
                    console.warn(`todo dlg avatar`, filename);
                    break;
                }
                case 0xB8: {
                    const [chNo] = this.script.seq('1C');
                    console.log('rem chapter', chNo);
                    break;
                }
                case 0x1E:
                case 0x35:
                case 0x36:
                case 0x3A:
                case 0x4C:
                case 0x4D:
                case 0x50:
                case 0x51:
                case 0x57:
                case 0x5D:
                case 0x5E:
                case 0x5F:
                case 0x60:
                case 0x61:
                case 0x83:
                case 0x88:
                case 0xB6:
                case 0xBA:
                case 0xBB:
                case 0xBC:
                case 0xBD:
                case 0xBE:
                case 0xBF:
                case 0xC0: {
                    this.script.offset += cmdLen;
                    console.warn('todo', cmdCode.toString(16));
                    break;
                }
                default:
                    console.error('unknown', cmdCode.toString(16));
                    return ['ERROR'];
            }
        }
        return ['EOF'];
    }
}