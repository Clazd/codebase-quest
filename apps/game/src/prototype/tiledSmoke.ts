import Phaser from "phaser";
import data from "../../../../packages/worldgen/goldens/tiny-ts.overworld.tiled.json" with { type: "json" };

class Smoke extends Phaser.Scene {
  create() {
    this.cache.tilemap.add("generated", { format: Phaser.Tilemaps.Formats.TILED_JSON, data });
    const map = this.make.tilemap({ key: "generated" });
    const status = document.getElementById("status");
    if (status) {
      status.dataset.width = String(map.width);
      status.dataset.height = String(map.height);
      status.dataset.layers = map.layers.map((l) => l.name).join(",");
      status.dataset.ready = "true";
      status.textContent = `Loaded ${map.width} × ${map.height} generated map with ${map.layers.length} tile layers.`;
    }
  }
}
new Phaser.Game({
  type: Phaser.HEADLESS,
  width: 16,
  height: 16,
  scene: Smoke,
  audio: { noAudio: true },
  banner: false,
});
