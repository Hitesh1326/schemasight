# Architecture diagrams (Mermaid source)

The `.mmd` files in this folder are the Mermaid source for the architecture diagrams used in the main [README](../README.md). The rendered PNGs live in `assets/`:

| Source (`.mmd`)        | Rendered image (`assets/`)      |
|------------------------|----------------------------------|
| `system-architecture.mmd` | `system-architecture.png`   |
| `crawl-index-flow.mmd`    | `crawl-index-flow.png`       |
| `chat-rag-flow.mmd`       | `chat-rag-flow.png`          |

To regenerate the PNGs after editing a diagram, use a Mermaid CLI (e.g. `@mermaid-js/mermaid-cli`) or render in an editor that supports Mermaid (e.g. VS Code with a Mermaid extension), then save to `assets/`.
