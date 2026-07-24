import { PoemStage } from "../features/poem-stage/PoemStage";

export function bootstrap(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("#app is missing");

  root.innerHTML = `
    <main class="experience">
      <canvas class="stage-canvas" id="stageCanvas" tabindex="0" aria-label="可拨动的琵琶行全文长卷" aria-describedby="interactionGuide"></canvas>
      <div class="paper-grain" aria-hidden="true"></div>
      <div class="plectrum-cursor" id="plectrumCursor" aria-hidden="true"><i></i></div>

      <header class="topbar">
        <div class="work-mark" aria-label="琵琶行，唐，白居易">
          <h1>琵琶行</h1>
          <p>唐 · 白居易</p>
        </div>
        <div class="chapter" aria-live="polite">
          <span class="chapter__rule"></span>
          <span id="sectionName">序</span>
        </div>
        <div class="topbar__controls">
          <button class="playback-button" id="playbackButton" type="button" aria-pressed="false" aria-label="开始自动播放长卷">
            <i aria-hidden="true"></i><span>播放</span>
          </button>
          <button class="sound-button" id="muteButton" type="button" aria-pressed="false" aria-label="开启琵琶声音">
            <i aria-hidden="true"></i><span>启声</span>
          </button>
        </div>
      </header>

      <aside class="instruction" id="interactionGuide">
        <span>抵住卷缘，徐徐展卷</span>
        <span>左右横扫 · 点击文字弦奏曲 · 方向键阅卷</span>
      </aside>

      <footer class="timeline">
        <span class="timeline__end"><i aria-hidden="true">白</i>青衫湿</span>
        <button class="timeline__track" id="progressTrack" type="button" role="slider" aria-label="长卷进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="卷首" title="拖动卷轴，或使用左右方向键阅卷">
          <span class="timeline__fill" id="progressFill"></span>
        </button>
        <span class="timeline__counter" id="progressCounter">卷首</span>
      </footer>

      <section class="intro" id="introPanel">
        <button class="intro-strings" id="introStrings" type="button" aria-label="向左拨动琵琶弦，开始弹奏">
          <span class="intro-strings__head" aria-hidden="true"></span>
          <i data-string="0" aria-hidden="true"></i>
          <i data-string="1" aria-hidden="true"></i>
          <i data-string="2" aria-hidden="true"></i>
          <i data-string="3" aria-hidden="true"></i>
        </button>
        <div class="intro__title-group">
          <h2>琵琶行</h2>
          <div class="intro__byline">
            <span>唐 · 白居易</span>
          </div>
          <div class="intro__seal" aria-hidden="true">樂</div>
        </div>
        <div class="intro__direction" aria-hidden="true">
          <svg viewBox="0 0 72 18"><path d="M70 9H3M13 1 3 9l10 8" /></svg>
          <span>向左拨弦，开始弹奏</span>
        </div>
      </section>

      <section class="ending-page" id="endingPage" aria-hidden="true">
        <div class="ending-page__composition">
          <div class="ending-page__seal" aria-hidden="true">白</div>
          <h2>曲终</h2>
          <div class="ending-page__verse" aria-label="座中泣下谁最多，江州司马青衫湿">
            <p>座中泣下谁最多</p>
            <p>江州司马青衫湿</p>
          </div>
          <small>唐 · 白居易　《琵琶行》</small>
        </div>
      </section>
    </main>
  `;

  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`${selector} is missing`);
    return element;
  };

  new PoemStage(get("#stageCanvas"), {
    progress: get("#progressTrack"),
    progressFill: get("#progressFill"),
    section: get("#sectionName"),
    counter: get("#progressCounter"),
    mute: get("#muteButton"),
    playback: get("#playbackButton"),
    intro: get("#introPanel"),
    introStrings: get("#introStrings"),
    ending: get("#endingPage"),
    cursor: get("#plectrumCursor")
  });
}
