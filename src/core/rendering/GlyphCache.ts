export class GlyphCache {
  private cache = new Map<string, HTMLCanvasElement>();

  get(
    char: string,
    fontSize: number,
    color: string,
    dpr: number,
    inkMode: "black" | "white"
  ): HTMLCanvasElement {
    const key = `${char}|${fontSize}|${color}|${dpr}|${inkMode}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const padding = Math.ceil(fontSize * 0.9);
    const size = Math.ceil(fontSize + padding * 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(size * dpr);
    canvas.height = Math.ceil(size * dpr);
    canvas.dataset.size = String(size);
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    context.scale(dpr, dpr);
    context.font = `${fontSize}px "Long Cang Pipa", "Kaiti SC", "STKaiti", "KaiTi", serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const glyphX = size / 2;
    const glyphY = size / 2 + fontSize * 0.03;

    if (inkMode === "black") {
      // 黑墨版本依靠淡宣纸帘托底，保持笔画纤细而不是描成粗边字。
      context.strokeStyle = "rgba(239, 224, 190, 0.36)";
      context.lineWidth = Math.max(0.62, fontSize * 0.042);
      context.shadowColor = "rgba(244, 230, 198, 0.34)";
      context.shadowBlur = fontSize * 0.08;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0.6;
      context.strokeText(char, glyphX, glyphY);

      context.fillStyle = "#17130f";
      context.shadowColor = "rgba(242, 224, 187, 0.22)";
      context.shadowBlur = fontSize * 0.045;
      context.shadowOffsetX = 0.35;
      context.shadowOffsetY = 0.5;
      context.fillText(char, glyphX, glyphY);
    } else {
      // 白字保持端正、清晰；立体感只来自克制的硬边偏移，不使用模糊光晕。
      context.strokeStyle = "rgba(4, 9, 11, 0.68)";
      context.lineWidth = Math.max(0.38, fontSize * 0.018);
      context.shadowColor = "rgba(0, 0, 0, 0.72)";
      context.shadowBlur = 0;
      context.shadowOffsetX = 1.15;
      context.shadowOffsetY = 1.45;
      context.strokeText(char, glyphX, glyphY);

      context.fillStyle = color;
      context.shadowColor = "rgba(0, 0, 0, 0.58)";
      context.shadowBlur = 0;
      context.shadowOffsetX = 0.7;
      context.shadowOffsetY = 0.9;
      context.fillText(char, glyphX, glyphY);
    }

    context.save();
    context.globalAlpha = inkMode === "white" ? 0.1 : 0.2;
    context.shadowColor = "transparent";
    context.strokeStyle = inkMode === "black" ? color : "#fffdf5";
    context.lineWidth = Math.max(0.25, fontSize * 0.01);
    context.strokeText(char, glyphX - 0.3, glyphY - 0.35);
    context.restore();

    // 白字不再人工擦除笔画，避免小字号出现花、糊和断裂。
    if (inkMode === "black") {
      const seed = char.codePointAt(0) ?? 1;
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 0.09;
      context.translate(size / 2, size / 2);
      const y = ((seed * 5) % Math.max(1, Math.floor(fontSize * 0.8))) - fontSize * 0.4;
      const width = fontSize * (0.22 + (seed % 5) * 0.045);
      context.fillRect(-width / 2, y, width, Math.max(0.35, fontSize * 0.018));
      context.restore();
    }
    this.cache.set(key, canvas);
    return canvas;
  }

  clear(): void {
    this.cache.clear();
  }
}
