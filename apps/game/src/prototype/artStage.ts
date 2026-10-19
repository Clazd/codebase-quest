import kenneyUrl from "@codebase-quest/assets/kenney/tiny-dungeon/tilemap_packed.png";
import atlasUrl from "@codebase-quest/assets/prototype/sprites.json?url";
import spritesUrl from "@codebase-quest/assets/prototype/sprites.png";
import tilesUrl from "@codebase-quest/assets/prototype/tiles.png";
import Phaser from "phaser";

export function createArtStage(parent: HTMLElement, gallery = false, monsterFrame = 110) {
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  class ArtScene extends Phaser.Scene {
    preload() {
      this.load.atlas("study", spritesUrl, atlasUrl);
      this.load.spritesheet("kenney", kenneyUrl, { frameWidth: 16, frameHeight: 16 });
      this.load.spritesheet("tiles", tilesUrl, { frameWidth: 16, frameHeight: 16 });
      this.load.on("loaderror", () => {
        parent.dataset.error = "Asset failed to load";
      });
    }
    create() {
      for (const name of ["gitling", "gremlin"])
        for (let direction = 0; direction < 4; direction++) {
          const key = `${name}-${direction}`;
          this.anims.create({
            key,
            frames: [0, 1, 2, 3].map((i) => ({ key: "study", frame: `${key}-${i}` })),
            frameRate: 5,
            repeat: -1,
          });
          if (gallery || (name === "gitling" && direction === 0)) {
            const sprite = this.add
              .sprite(
                gallery ? 48 + direction * 80 : 125,
                gallery ? (name === "gitling" ? 42 : 108) : 38,
                "study",
                `${key}-0`,
              )
              .setScale(gallery ? 2 : 1.5);
            sprite.play(key);
          }
        }
      if (gallery) {
        for (let i = 0; i < 4; i++) this.add.image(48 + i * 80, 172, "kenney", 110 + i).setScale(2);
        for (let i = 0; i < 6; i++) this.add.image(38 + i * 52, 220, "tiles", i).setScale(3);
      } else this.add.image(48, 45, "kenney", monsterFrame).setScale(4);
      parent.dataset.ready = "true";
      // The HTML caption carries the accessible equivalent of this visual study.
      this.game.canvas.setAttribute("aria-hidden", "true");
    }
    override update() {
      if (paused) this.anims.pauseAll();
      else this.anims.resumeAll();
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#171e2a",
    pixelArt: true,
    scale: { width: gallery ? 336 : 170, height: gallery ? 250 : 84, zoom: gallery ? 2 : 1 },
    scene: ArtScene,
    audio: { noAudio: true },
  });
  return {
    destroy: () => game.destroy(true),
    toggle: () => {
      paused = !paused;
      return paused;
    },
    get paused() {
      return paused;
    },
  };
}
