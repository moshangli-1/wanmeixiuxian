// ============================================================
// 程序化国风氛围音乐 —— WebAudio 实时合成（古筝式拨弦 + 空灵垫底）
// 无任何音频文件，零版权负担；首次点击"♪"后启动
// ============================================================
(function () {
  let ctx = null, master = null, padGain = null, delay = null, timer = null;
  let playing = false;

  // C 宫五声音阶（宫商角徵羽）跨两个半八度
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0,
                 523.25, 587.33, 659.26, 784.0, 880.0,
                 1046.5, 1174.7, 1318.5];

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

    // 回声（模拟山谷余韵）
    delay = ctx.createDelay(2.0); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);

    // 氛围垫底：双振荡器 + 缓慢滤波起伏
    padGain = ctx.createGain(); padGain.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    [[130.81, 'sine', .5], [196.0, 'triangle', .22], [261.63, 'sine', .28]].forEach(([f, t, g]) => {
      const o = ctx.createOscillator(); o.type = t; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og); og.connect(lp); o.start();
    });
    lp.connect(padGain); padGain.connect(master);
    padGain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 4);
  }

  // 古筝式拨弦：主音 + 八度泛音，指数衰减，进回声
  function pluck(freq, when, vel) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.005;
    const g = ctx.createGain(); const g2 = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.9);
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.exponentialRampToValueAtTime(vel * 0.24, when + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
    o.connect(g); o2.connect(g2); g.connect(master); g.connect(delay); g2.connect(delay);
    o.start(when); o.stop(when + 2.1); o2.start(when); o2.stop(when + 1.1);
  }

  function scheduleNext() {
    if (!playing) return;
    const wait = 1300 + Math.random() * 2600;
    timer = setTimeout(() => {
      if (!playing) return;
      const t = ctx.currentTime + 0.05;
      const n = SCALE[Math.floor(Math.random() * SCALE.length)];
      pluck(n, t, 0.16 + Math.random() * 0.1);
      // 偶尔双音/流水句
      if (Math.random() < 0.35) pluck(SCALE[Math.floor(Math.random() * SCALE.length)], t + 0.18 + Math.random() * 0.2, 0.1);
      if (Math.random() < 0.12) pluck(n / 2, t + 0.3, 0.14);
      scheduleNext();
    }, wait);
  }

  window.XianAudio = {
    toggle() {
      if (!ctx) init();
      if (ctx.state === 'suspended') ctx.resume();
      playing = !playing;
      if (playing) { padGain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 2); scheduleNext(); }
      else {
        clearTimeout(timer);
        padGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      }
      return playing;
    },
    // 突破特效音：上行琶音
    fanfare() {
      if (!ctx || !playing) return;
      const t = ctx.currentTime + 0.05;
      [523.25, 659.26, 784.0, 1046.5, 1318.5].forEach((f, i) => pluck(f, t + i * 0.12, 0.22));
    },
    // 失败音：下行闷响
    thud() {
      if (!ctx || !playing) return;
      const t = ctx.currentTime + 0.05;
      pluck(220, t, 0.2); pluck(174, t + 0.2, 0.18); pluck(110, t + 0.45, 0.2);
    },
  };
})();
