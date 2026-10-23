"use client";
import { StateEffect, StateField, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export type GlintVariant = "new" | "learned" | "b" | "flow";
export type GlintRange = { id: string; start: number; end: number; variant: GlintVariant };

export const setGlintRanges = StateEffect.define<GlintRange[]>();

const WIDGET: Record<GlintVariant, { text: string; title: string }> = {
  new: { text: "✦ why?", title: "Did you catch why this is here?" },
  learned: { text: "★ learned", title: "Revisit this lesson" },
  b: { text: "B · naive", title: "You swapped in the naive version" },
  flow: { text: "", title: "" },
};

class GlintButton extends WidgetType {
  constructor(
    readonly id: string,
    readonly variant: GlintVariant,
  ) {
    super();
  }
  eq(other: GlintButton) {
    return other.id === this.id && other.variant === this.variant;
  }
  toDOM() {
    const el = document.createElement("button");
    el.className = `glint-widget ${this.variant}`;
    el.dataset.glintOpen = this.id;
    el.textContent = WIDGET[this.variant].text;
    el.title = WIDGET[this.variant].title;
    return el;
  }
}

function buildDecorations(doc: Text, ranges: GlintRange[]): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const taken = new Set<number>();
  for (const r of ranges) {
    const end = Math.min(r.end, doc.lines);
    if (r.start < 1 || r.start > end) continue;
    for (let n = r.start; n <= end; n++) {
      if (taken.has(n)) continue;
      taken.add(n);
      decos.push(
        Decoration.line({
          attributes: { class: `glint-line glint-${r.variant}` },
        }).range(doc.line(n).from),
      );
    }
    if (r.variant === "flow") continue;
    const first = doc.line(r.start);
    decos.push(
      Decoration.widget({ widget: new GlintButton(r.id, r.variant), side: 1 }).range(first.to),
    );
  }
  return Decoration.set(decos, true);
}

const glintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setGlintRanges)) next = buildDecorations(tr.state.doc, e.value);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Extensions for the Sandpack editor: glint decorations, selection and doc-change reporting. */
export function glintExtensions(onSelection: (text: string) => void, onDocChange: () => void) {
  return [
    glintField,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onDocChange();
      if (!u.selectionSet && !u.docChanged) return;
      const sel = u.state.selection.main;
      onSelection(sel.empty ? "" : u.state.sliceDoc(sel.from, sel.to));
    }),
  ];
}
