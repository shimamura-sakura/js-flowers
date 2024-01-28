'use strict';
class Sounds {
    audioElems = [0, 1, 2, 3].map(() => new Audio());
    constructor (ctx) {
        this.ctx = ctx;
        this.globalGain = ctx.createGain();
        this.globalGain.connect(ctx.destination);
        this.audioNodes = this.audioElems.map(a => ctx.createMediaElementSource(a));
        this.audioGains = this.audioNodes.map(n => {
            const g = ctx.createGain();
            n.connect(g);
            g.connect(this.globalGain);
            return g;
        });
    }
    *play(index, src, loop, fadeInMS) {
        const elem = this.audioElems[index];
        elem.pause();
        elem.loop = !!loop;
        elem.src = src;
        var wait = true;
        elem.onloadeddata = () => wait = false;
        while (wait)
            yield;
        wait = true;
        elem.play().finally(() => {
            const g = this.audioGains[index].gain;
            g.cancelScheduledValues(this.ctx.currentTime);
            if (fadeInMS) {
                g.setValueAtTime(0, this.ctx.currentTime);
                g.linearRampToValueAtTime(1, this.ctx.currentTime + fadeInMS / 1000);
            } else
                g.setValueAtTime(1, this.ctx.currentTime);
            wait = false;
        });
        while (wait)
            yield;
    }
    stop(index) {
        this.audioElems[index].pause();
    }
    fadeOut(index, fadeOutMS) {
        const g = this.audioGains[index].gain;
        g.cancelScheduledValues(this.ctx.currentTime);
        g.setValueAtTime(g.value, this.ctx.currentTime);
        g.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOutMS / 1000);
    }
}