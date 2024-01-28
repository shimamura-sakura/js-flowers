'use strict';
const FRAME_INTERVAL = 1000 / 25;
/** @type {HTMLCanvasElement} */
const cvs = document.getElementById('screen');
const c2d = cvs.getContext('2d');
const atx = new AudioContext();
const eVars = document.getElementById('variables');
// FS
const Fs = {
    printemps: {
        start: 'start_printemps.s',
        bg(filename) { return `fs/printemps/bgimage/${filename}`; },
        fg(filename) { return `fs/printemps/fgimage/${filename}`; },
        sys(filename) { return `fs/printemps/system/${filename}`; },
        bgm(name) { return `fs/printemps/bgm/${name}.ogg`; },
        voice(name) { return `fs/printemps/voice/${name}.ogg`; },
        se(name) { return `fs/printemps/se/${name}.ogg`; }
    },
    ete: {
        start: 'start_ete.s',
        bg(filename) { return `fs/ete/bgimage/${filename}`; },
        fg(filename) { return `fs/ete/fgimage/${filename}`; },
        sys(filename) { return `fs/ete/system/${filename}`; },
        bgm(name) { return `fs/ete/bgm/${name.toLowerCase()}.ogg`; },
        voice(name) { return `fs/ete/voice/${name}.ogg`; },
        se(name) { return `fs/ete/se/${name}.ogg`; }
    }
};
const Fs_using = Fs.printemps;
// SOUND
const sound = new Sounds(atx);
// SCENE
const scene = new Scene(cvs.width, cvs.height);
// WINDOW
const textWnd = new TextWindow(Fs_using);
// INTERPRETER
const interp = new Interpreter(Fs_using, sound, scene, textWnd, eVars);
interp.setScript(Fs_using.start);

const jsflower = { intv: null, skip: false };

function* main() {
    var isTimeStop = 100;
    var waitInterp = 0;
    var waitRender = 0;

    var clickMode = 'NONE';
    cvs.onclick = () => {
        switch (clickMode) {
            case 'WAIT':
            case 'CLICK':
                waitInterp = 0;
                break;
            case 'FADE':
                scene.stopFade();
                waitInterp = 0;
                break;
            case 'DIALOG':
                interp.afterDialog();
                waitInterp = 0;
                break;
            case 'SELECT':
                if (textWnd.iSel != null) {
                    interp.script.offset = textWnd.sels[textWnd.iSel].offset;
                    textWnd.setSels(null);
                    waitInterp = 0;
                }
                break;
        }
    };
    cvs.onmousemove = ev => {
        textWnd.setMouse(ev.offsetX, ev.offsetY);
    };
    while (true) {
        if (jsflower.skip && clickMode != 'SELECT')
            cvs.onclick();
        if (waitInterp <= 0) {
            clickMode = -1;
            const [msgType, ...msgArgs] = interp.next();
            switch (msgType) {
                case 'FADE':
                    waitInterp = msgArgs[0];
                    clickMode = 'FADE';
                    break;
                case 'WAIT':
                    waitInterp = msgArgs[0];
                    clickMode = 'WAIT';
                    break;
                case 'WAIT_IMG':
                    yield* interp.waitImgs();
                    break;
                case 'SOUND':
                    yield* sound.play(...msgArgs);
                    break;
                case 'SELECT':
                    waitInterp = Infinity;
                    clickMode = 'SELECT';
                    break;
                case 'DIALOG':
                    waitInterp = Infinity;
                    clickMode = 'DIALOG';
                    break;
                case 'CLICK':
                    waitInterp = Infinity;
                    clickMode = 'CLICK';
                    break;
                default:
                    console.error('unknown interpreter message', msgType, ...msgArgs);
                    return;
            }
        }
        if (waitRender <= 0) {
            scene.draw(c2d);
            textWnd.draw(c2d);
            yield;
            waitRender = FRAME_INTERVAL;
        }
        const incr = Math.min(waitInterp, waitRender);
        waitInterp -= incr;
        waitRender -= incr;
        scene.tick(incr);
        if (incr <= 0) {
            if ((isTimeStop -= 1) < 0) {
                console.error('time stopped ?');
                isTimeStop = 100;
            }
        } else
            isTimeStop = 100;
    }
}

const genMain = main();
function setTicking(state) {
    if (jsflower.intv)
        window.clearInterval(jsflower.intv);
    if (state)
        jsflower.intv = window.setInterval(() => genMain.next(), FRAME_INTERVAL);
    else
        jsflower.intv = null;
}

function setSkipMode(state) {
    jsflower.skip = state;
}