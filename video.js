'use strict';
class Layer {
    mode = 0;
    color = 'black';
    lstOpts = null;
    imgOpts = [0, 0, 100, 100, 255];
    imgElem = new Image();
    imgReady = true;
    imgWidth = 0;
    imgHeight = 0;
    constructor (isBackground) {
        this.isBackground = !!isBackground;
        this.imgElem.onerror = () => console.error('img error, src', this.imgElem.src);
        this.imgElem.onload = () => {
            this.imgReady = true;
            this.imgWidth = this.imgElem.naturalWidth;
            this.imgHeight = this.imgElem.naturalHeight;
        };
    }
    setEmpty() {
        this.mode = 0;
        this.imgReady = true;
    }
    setColor(r, g, b) {
        this.mode = 1;
        this.imgReady = true;
        this.color = `rgb(${r},${g},${b})`;
    }
    setImage(src) {
        this.mode = 2;
        this.imgReady = false;
        this.imgElem.src = src;
    }
    setImageOpts(opts) { this.imgOpts = opts; }
    drawLastOpts(c2d) { this.realDraw(c2d, this.lstOpts); }
    drawSelfOpts(c2d) {
        this.lstOpts = this.imgOpts.map(x => x);
        this.realDraw(c2d, this.imgOpts);
    }
    drawWithOpts(c2d, opts) {
        this.lstOpts = opts.map(x => x);
        this.realDraw(c2d, opts);
    }
    realDraw(c2d, opts) {
        switch (this.mode) {
            case 1:
                c2d.globalAlpha = 1;
                c2d.fillStyle = this.color;
                c2d.fillRect(0, 0, c2d.canvas.width, c2d.canvas.height);
                break;
            case 2:
                if (this.isBackground) {
                    c2d.globalAlpha = 1;
                    c2d.drawImage(this.imgElem, 0, 0);
                } else {
                    const [dxMid, dy, xScale, yScale, alpha] = opts;
                    c2d.globalAlpha = alpha / 255;
                    c2d.drawImage(this.imgElem,
                        0, 0, this.imgWidth, this.imgHeight,
                        dxMid - this.imgWidth / 2, dy,
                        xScale / 100 * this.imgWidth,
                        yScale / 100 * this.imgHeight);
                }
        }
    }
}
class OptsAnim {
    count = 0;
    duration = 1;
    running = false;
    optsA = [0, 0, 100, 100, 255]; newA = false;
    optsB = [0, 0, 100, 100, 255]; newB = false;
    setOptA(opts, repeats) {
        this.newA = true;
        this.optsA = opts;
        this.count = repeats + 1;
    }
    setOptB(opts, duration) {
        this.newB = true;
        this.optsB = opts;
        this.duration = Math.max(1, duration);
    }
    start() {
        if (this.newA && this.newB)
            this.running = true;
        this.newA = this.newB = false;
    }
    stop() { this.running = false; }
    optsTime(time) {
        if (time >= this.duration * this.count) return this.optsB;
        const amt = time % this.duration / this.duration;
        return this.optsA.map((v, i) => v + (this.optsB[i] - v) * amt);
    }
}
class Scene {
    bg = new Layer(true);
    fg = [0, 1, 2, 3, 4].map(() => new Layer());
    allImgReady() { return this.bg.imgReady && this.fg.every(l => l.imgReady); }
    fa = [0, 1, 2, 3, 4].map(() => new OptsAnim());
    animTime = -1;
    fadeTime = -1;
    fadeDuration = 1;
    constructor (w, h) {
        this.cvsCurr = new OffscreenCanvas(w, h); // document.getElementById('cvs_curr') // 
        this.cvsSave = new OffscreenCanvas(w, h); // document.getElementById('cvs_next') // 
        this.c2dCurr = this.cvsCurr.getContext('2d');
        this.c2dSave = this.cvsSave.getContext('2d');
    }
    initFade(duration) {
        this.fadeTime = 0;
        this.fadeDuration = Math.max(1, duration);
        [this.c2dSave, this.c2dCurr] = [this.c2dCurr, this.c2dSave];
        [this.cvsSave, this.cvsCurr] = [this.cvsCurr, this.cvsSave];
        this.c2dCurr.globalCompositeOperation = 'copy';
        this.bg.drawSelfOpts(this.c2dCurr);
        this.c2dCurr.globalCompositeOperation = 'source-over';
        this.fg.forEach(l => l.drawSelfOpts(this.c2dCurr));
    }
    stopFade() {
        this.fadeTime = -1;
    }
    drawFade(c2d) {
        var amount;
        if (this.fadeTime < 0)
            amount = 1;
        else
            amount = Math.min(1, this.fadeTime / this.fadeDuration);
        c2d.globalCompositeOperation = 'copy';
        if (amount < 1) {
            c2d.globalAlpha = 1 - amount;
            c2d.drawImage(this.cvsSave, 0, 0);
            c2d.globalCompositeOperation = 'lighter';
        }
        c2d.globalAlpha = amount;
        c2d.drawImage(this.cvsCurr, 0, 0);
    }
    startAnim() {
        if (this.animTime < 0) {
            this.animTime = 0;
            this.fa.forEach(a => a.start());
        }
    }
    drawAnim(forceB) {
        this.c2dCurr.globalCompositeOperation = 'copy';
        this.bg.drawSelfOpts(this.c2dCurr);
        this.c2dCurr.globalCompositeOperation = 'source-over';
        this.fa.forEach((a, i) => {
            if (forceB)
                this.fg[i].drawWithOpts(this.c2dCurr, a.optsB);
            else if (a.running)
                this.fg[i].drawWithOpts(this.c2dCurr, a.optsTime(this.animTime));
            // else this.fg[i].drawLastOpts(this.c2dCurr)
        });
    }
    stopAnim() {
        if (this.animTime >= 0) {
            this.animTime = -1;
            if (this.fa.some(a => a.running))
                this.drawAnim(true);
            this.fa.forEach(a => a.stop());
        }
    }
    draw(c2d) {
        if (this.animTime >= 0)
            this.drawAnim();
        this.drawFade(c2d);
    }
    tick(time) {
        if (this.fadeTime >= 0) this.fadeTime += time;
        if (this.animTime >= 0) this.animTime += time;
    }
}
class TextWindow {
    show = false;
    mode = 0;
    dlgName = null;
    dlgText = null;
    sels = null;
    iSel = null;
    mouseX = null;
    mouseY = null;
    constructor (fs) {
        (this.imgYuriGauge = new Image()).src = fs.sys('lily_gauge.png');
        (this.imgWndFrame = new Image()).src = fs.sys('window_frame.png');
        (this.imgWndBack = new Image()).src = fs.sys('window.png');
    }
    setText(name, text) {
        this.dlgName = name;
        this.dlgText = text;
    }
    setSels(sels) {
        this.sels = sels;
    }
    setMouse(x, y) {
        this.mouseX = x;
        this.mouseY = y;
    }
    draw(c2d) {
        if (this.show) switch (this.mode) {
            case 0:
                c2d.globalAlpha = 1;
                c2d.globalCompositeOperation = 'source-over';
                // NO YURI !
                // window bg
                c2d.globalAlpha = 0.75;
                c2d.drawImage(this.imgWndBack, 64, 542);
                // window frame
                c2d.globalAlpha = 1;
                c2d.drawImage(this.imgWndFrame, 0, 420);
                // text
                if (this.dlgText) {
                    c2d.fillStyle = 'black';
                    if (this.dlgName) {
                        c2d.textBaseline = 'top';
                        c2d.font = '26px IPAmjMincho';
                        c2d.fillText(this.dlgName, 64 + 202, 542 + 29);
                    }
                    textDrawEx(c2d, this.dlgText, 64 + 202 + 74, 542 + 29, 1280 - 240);
                }
        }
        if (this.sels) {
            c2d.globalCompositeOperation = 'source-over';
            this.iSel = null;
            this.sels.forEach(({ offset, str }, i) => {
                c2d.globalAlpha = 0.75;
                const y0 = 40 * i;
                const w = 600;
                const h = 40;
                c2d.fillStyle = 'black';
                if (this.mouseX != null && this.mouseY != null) {
                    const x = this.mouseX - 0;
                    const y = this.mouseY - y0;
                    if (x >= 0 && y >= 0 && x < w && y < h) {
                        c2d.fillStyle = 'green';
                        this.iSel = i;
                    }
                }
                c2d.fillRect(0, y0, w, h);
                c2d.globalAlpha = 1;
                c2d.fillStyle = 'white';
                textDrawEx(c2d, str, 1, 40 * i + 6, 600);
            });
        }
    }
}
function* textSplit(text) {
    var rubyFlag = 0;
    var rubyText = [];
    for (const ch of text) {
        switch (ch) {
            case '<':
                switch (rubyFlag) {
                    case 0:
                        rubyFlag = 1;
                        yield ['RUBY_START'];
                        break;
                    case 1:
                        rubyFlag = 2;
                        rubyText.length = 0;
                        break;
                    default:
                        yield ['CHAR', ch];
                }
                break;
            case '>':
                if (rubyFlag == 2) {
                    rubyFlag = 0;
                    yield ['RUBY_END', rubyText.join('')];
                    break;
                }
            default:
                if (rubyFlag == 2)
                    rubyText.push(ch);
                else
                    yield ['CHAR', ch];
        }
    }
}
function textDrawEx(ctx, text, xLeft, yTop, xRight) {
    const baseSize = 26;
    const rubySize = 12;
    const left = xLeft;
    const right = xRight;
    const ystep = baseSize + rubySize;
    const baseFont = 'IPAmjMincho';
    const rubyFont = 'Ume P Gothic';
    var rubyL = null;
    var x = left;
    var y = yTop;
    for (const [type, seg] of textSplit(text)) {
        switch (type) {
            case 'CHAR':
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = `${baseSize}px ${baseFont}`;
                if (seg == '＄') {
                    x = left, y += ystep, rubyL = left;
                    continue;
                }
                const width = ctx.measureText(seg).width;
                if ((x + width) > right && '、。「」：'.indexOf(seg) == -1) {
                    x = left, y += ystep, rubyL = left;
                }
                ctx.fillText(seg, x, y);
                x += width;
                break;
            case 'RUBY_START':
                rubyL = x;
                break;
            case 'RUBY_END':
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.font = `${rubySize}px ${rubyFont}`;
                ctx.fillText(seg, (x + rubyL) / 2, y);
                break;
        }
    }
}