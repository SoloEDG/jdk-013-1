import { ref } from "vue";
import { createCamera } from "../features/panorama";
import { createPlayback } from "../features/chapters";
import { createDiscovery } from "../features/hotspots";
import { createBranch } from "../features/interviews";
import type { Journal } from "../features/journal";
import type { Command, FilmContent, Position } from "../shared/types";
export function createWorkspace(content: FilmContent, journal: Journal) {
  const camera = createCamera(),
    playback = createPlayback(content.chapters),
    discovery = createDiscovery(content.hotspots, () => playback.state),
    branch = createBranch(content.people),
    tab = ref("story");
  const position = (): Position => ({
    chapterId: playback.state.chapterId,
    time: playback.state.time,
    camera: { ...camera.camera },
    playing: playback.state.playing,
  });
  function enterPerson(id: string) {
    branch.enter(id, position());
    playback.state.playing = false;
    discovery.close();
  }
  function dispatch(command: Command) {
    switch (command.type) {
      case "chapter":
        if (branch.personId.value) return;
        playback.select(command.id);
        camera.reset();
        discovery.close();
        break;
      case "seek":
        playback.seek(command.time);
        break;
      case "hotspot":
        discovery.select(command.id);
        break;
      case "return": {
        const saved = branch.leave();
        if (saved) {
          playback.select(saved.chapterId);
          playback.seek(saved.time);
          camera.restore(saved.camera);
          playback.state.playing = saved.playing;
        }
        break;
      }
      case "revisit":
        branch.leave();
        playback.select(command.entry.chapterId);
        playback.seek(command.entry.time);
        camera.restore(command.entry.camera);
        discovery.select(command.entry.hotspotId);
        tab.value = "story";
        break;
    }
  }
  function save() {
    const h = discovery.detail.value;
    if (h) journal.save(h, position());
  }
  return {
    content,
    camera,
    playback,
    discovery,
    branch,
    journal,
    tab,
    position,
    enterPerson,
    dispatch,
    save,
  };
}
export type Workspace = ReturnType<typeof createWorkspace>;
