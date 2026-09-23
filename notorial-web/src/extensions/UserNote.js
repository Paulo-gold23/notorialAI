import { Mark, mergeAttributes } from '@tiptap/core';

// ── UserNote TipTap Mark ──────────────────────────────────────────────────────
// Stores the note text in data-user-note attribute.
// The editor shows only a visual highlight; the sidebar surfaces the note content.
export const UserNote = Mark.create({
    name: 'userNote',

    // Allow the mark to span across multiple inline nodes (e.g. bold + plain text)
    spanning: true,

    addAttributes() {
        return {
            note: {
                default: null,
                // Explicit round-trip: parse from data-user-note, render to data-user-note
                parseHTML: element => element.getAttribute('data-user-note') || null,
                renderHTML: attributes => {
                    if (!attributes.note) return {};
                    return { 'data-user-note': attributes.note };
                },
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-user-note]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
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
