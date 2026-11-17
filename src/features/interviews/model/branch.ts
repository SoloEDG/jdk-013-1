import { computed, ref } from "vue";
import type { Person, Position } from "../../../shared/types";
export function createBranch(people: Person[]) {
  const personId = ref<string | null>(null),
    returnPoint = ref<Position | null>(null),
    paragraph = ref(0);
  const person = computed(() =>
    personId.value ? people.find((p) => p.id === personId.value) : undefined,
  );
  function enter(id: string, position: Position) {
    if (!people.some((p) => p.id === id)) return;
    returnPoint.value = structuredClone(position);
    personId.value = id;
    paragraph.value = 0;
  }
  function leave() {
    const point = returnPoint.value;
    personId.value = null;
    returnPoint.value = null;
    return point;
  }
  return { personId, returnPoint, paragraph, person, enter, leave };
}
export type Branch = ReturnType<typeof createBranch>;
