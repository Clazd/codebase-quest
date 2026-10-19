import { createArtStage } from "./artStage.ts";
import "./prototype.css";

const host = document.querySelector<HTMLElement>("#art-stage");
const button = document.querySelector<HTMLButtonElement>("#pause");
if (host && button) {
  const stage = createArtStage(host, true);
  const sync = () => {
    button.textContent = stage.paused ? "Resume animation" : "Pause animation";
    button.setAttribute("aria-pressed", String(stage.paused));
  };
  button.addEventListener("click", () => {
    stage.toggle();
    sync();
  });
  sync();
}
