import { Mark, mergeAttributes } from '@tiptap/core';

// ── UserNote TipTap Mark ──────────────────────────────────────────────────────
// Stores the note text in data-user-note attribute.
// The editor shows only a visual highlight; the sidebar surfaces the note content.
export const UserNote = Mark.create({
    name: 'userNote',

    addAttributes() {
        return {
            note: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-user-note]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-user-note': HTMLAttributes.note ?? '',
                class: 'user-note-wrapper',
            }),
            0,
        ];
    },
});

// ── Helper: extract all active ressalvas from the TipTap doc ─────────────────
export function extractRessalvas(editor) {
    if (!editor) return [];
    const notes = [];
    let idx = 0;
    editor.state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
            if (mark.type.name === 'userNote' && mark.attrs.note) {
                const text = node.textContent;
                notes.push({
                    id: idx++,
                    pos,
                    nodeSize: node.nodeSize,
                    excerpt: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
                    note: mark.attrs.note,
                });
            }
        });
    });
    return notes;
}
