import Image from '@tiptap/extension-image';

// ── ImagePlaceholder ──────────────────────────────────────────────────────────
// Extends the default Tiptap Image node with a custom NodeView that renders
// a simple text placeholder in the editor instead of the heavy base64 image.
//
// In the editor:  [Imagem: foto_2024.jpg]
// In getHTML():   <img class="ata-imagem-anexada" src="data:image/jpeg;base64,..." alt="foto_2024.jpg" />
//
// This keeps the document data intact while giving users a clear visual
// indicator that an image exists at this position.
export const ImagePlaceholder = Image.extend({
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('span');
            dom.className = 'ata-imagem-placeholder';
            dom.contentEditable = 'false';

            const filename = node.attrs.alt || 'imagem anexada';
            dom.textContent = `[Imagem: ${filename}]`;

            return { dom };
        };
    },
});
