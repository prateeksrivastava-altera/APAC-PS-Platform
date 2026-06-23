# Image Processing for Test Script Builder — Options Review

**Technology Selection for Document Image Extraction and Description**

---

## Background

The Test Script Builder currently processes text-only content from uploaded documents. This document outlines four options for extending the pipeline to extract and interpret images (screenshots, diagrams, flowcharts) embedded in PDF and Word documents, enabling the AI pipeline to generate more comprehensive test scripts that account for visual content.

Each option has been assessed against the following constraints:

- No third-party AI providers — company IP must not leave the organisation
- Compatibility with the existing hosted deployment
- Matcha LLM 1 million character limit (base64 image data would consume this too quickly)
- The application already uses **Azure Active Directory** for authentication

---

## The Core Problem: OCR vs. Image Understanding

| Approach | What it does | Works for |
|----------|-------------|-----------|
| **OCR** (text extraction) | Reads text pixels embedded in an image | Screenshots with visible labels and form fields |
| **Image Understanding** (captioning) | Generates a natural-language description of what the image *means* | Diagrams, flowcharts, wireframes, architecture charts |

Most meaningful images in software documentation (process flows, UI wireframes, architecture diagrams) contain little to no readable text. An OCR-only approach will miss the majority of valuable visual content.

---

## Option A — Transformers.js with BLIP (In-Browser Image Understanding)

**What it is:** Hugging Face's Transformers.js library runs open-source vision AI models (BLIP, Florence-2) directly in the user's browser using WebAssembly and WebGPU. The model downloads once and is cached locally. All image analysis happens on the user's device — nothing is sent to any server or external service.

### Pros

| Feature | Detail |
|---------|--------|
| Zero IP risk | Images never leave the user's browser — nothing is transmitted to any server or external service |
| No API key required | Completely free to run with no ongoing cost per image |
| True image understanding | Can describe diagrams, flowcharts, and wireframes — not just text extraction |
| No server changes needed | Entire feature lives in the browser; hosted server is untouched |
| Works offline after first load | Model is cached in the browser after the initial download |

### Cons

| Feature | Detail |
|---------|--------|
| Large initial download | ~200–300 MB model download on first use (cached for future visits) |
| Slow inference | 5–30 seconds per image depending on the user's hardware |
| Hardware-dependent quality | Performance varies across devices; older machines may be very slow |
| Model quality ceiling | Open-source model quality is good but below commercial APIs for complex technical diagrams |
| Modern browser required | WebGPU required for best performance; older browsers fall back to slower WASM |

**Best suited for:** Organisations where IP sensitivity is the top priority and user machines are reasonably modern (2020 or later).

---

## Option B — Azure AI Vision ⭐ Recommended

**What it is:** Azure AI Vision (formerly Azure Computer Vision) is a Microsoft service available within the company's own Azure subscription. The application already uses Azure Active Directory for authentication, meaning the Azure tenancy relationship is already established. Images travel from the user's browser to the hosted Express server, then to the company's own Azure AI Vision resource — never touching any third-party provider.

Azure AI Vision provides both **Dense Captions** (semantic image descriptions) and **OCR** (text extraction), making it suitable for all documentation image types including diagrams, UI screens, and process flows.

### Pros

| Feature | Detail |
|---------|--------|
| Data stays in company Azure tenant | Same data boundary as existing Azure AD authentication — no new vendor relationship |
| Best image understanding quality | Commercial-grade API producing detailed, accurate descriptions |
| Fast response | ~1–3 seconds per image regardless of client hardware |
| Handles all image types | Diagrams, flowcharts, UI screenshots, tables, and embedded text |
| Consistent performance | Server-side processing; not dependent on the user's device |
| Low cost | Approximately $1 USD per 1,000 images analysed |
| Minimal code change | New server endpoint follows the same pattern as existing Matcha API calls |

### Cons

| Feature | Detail |
|---------|--------|
| Requires resource provisioning | IT/admin task to create and configure the Azure AI Vision resource in the Azure Portal |
| Two new environment variables | `AZURE_VISION_ENDPOINT` and `AZURE_VISION_KEY` added to server configuration |
| Images travel to Azure | Requires sign-off that the company Azure tenant is an approved boundary for document processing |

**Best suited for:** This application's current situation. Azure is already in use for authentication; extending to Azure AI Vision keeps all data within the same company-controlled cloud boundary with no new vendors.

---

## Option C — Tesseract.js (Browser-Side Text OCR)

**What it is:** Tesseract.js is a mature, widely-used OCR library that runs entirely in the browser via WebAssembly. It reads text that is embedded or printed within images — for example, a screenshot of a form with visible field labels. It cannot understand or describe images that contain no readable text, such as flowcharts, architecture diagrams, or wireframes.

### Pros

| Feature | Detail |
|---------|--------|
| Zero IP risk | Runs entirely in-browser; no data is sent anywhere |
| Fast and lightweight | ~4 MB library; processes images in under 5 seconds |
| No API key or cost | Completely free and open source |
| Proven and stable | Widely used, well-documented, and reliable across all modern browsers |

### Cons

| Feature | Detail |
|---------|--------|
| Text-only | Cannot describe diagrams, flowcharts, or any image without visible text pixels |
| Limited value for documentation images | Most meaningful documentation visuals are not text-pixel images |
| Noisy output on complex layouts | Mixed text/image pages can produce garbled or incomplete OCR results |
| Not a complete solution | Does not address the core need of understanding visual content |

**Best suited for:** Use as a **fallback** when Option A or B is unavailable, not as a primary solution. Provides partial value for text-heavy screenshots but misses most diagram content.

---

## Option D — Self-Hosted Vision Model (LLaVA / Moondream on App Server)

**What it is:** Open-source vision language models such as Moondream2 (~1.9 GB) or LLaVA-7B (~4 GB) can be run directly on the application server using a framework such as Ollama. This makes the server fully self-contained — no external API calls for image processing. The model runs as a local service alongside the Express application.

### Pros

| Feature | Detail |
|---------|--------|
| Fully self-contained | No external network calls for image processing once deployed |
| Good image understanding | Moondream2 and LLaVA produce meaningful descriptions for technical content |
| No per-image cost | One-time infrastructure cost only |
| No vendor dependency | Entirely controlled by the organisation |

### Cons

| Feature | Detail |
|---------|--------|
| Significant hardware requirement | Moondream2 needs ~4 GB RAM minimum; LLaVA-7B needs 8–16 GB RAM plus ideally a GPU |
| Not compatible with PaaS hosting | Cannot run on Azure App Service standard tiers; requires a VM or container with dedicated resources |
| Operational overhead | Model updates, version management, and uptime monitoring add ongoing complexity |
| Deployment complexity | Requires Ollama or equivalent runtime installed and maintained on the server |

**Best suited for:** Only if the application is hosted on a dedicated virtual machine or container with spare GPU/CPU resources. Not recommended for standard PaaS deployments such as Azure App Service.

---

## Summary Comparison

| Option | Image Understanding | IP Risk | Setup Effort | Cost | Performance |
|--------|-------------------|---------|--------------|------|-------------|
| **A — Transformers.js** | Full (diagrams + text) | None — browser only | Low — no server changes | Free | Slow — device-dependent (5–30 sec) |
| **B — Azure AI Vision** ⭐ | Full (diagrams + text) | Low — company Azure tenant | Medium — provision Azure resource | ~$1 / 1,000 images | Fast — 1–3 sec/image |
| **C — Tesseract.js** | Text pixels only | None — browser only | Low | Free | Fast — under 5 sec |
| **D — Self-Hosted Model** | Full (diagrams + text) | None — on-premise | High — VM + model setup | Infrastructure only | Medium — GPU-dependent |

---

## Recommendation

**Option B (Azure AI Vision)** is the recommended path for this application. The company already operates within Azure for authentication, making Azure AI Vision a natural extension of the existing infrastructure boundary. It delivers the highest image understanding quality with predictable performance, minimal ongoing cost, and no new vendor relationships.

**Option C (Tesseract.js)** should be implemented alongside Option B as a graceful fallback for environments where the Azure Vision resource is unavailable — if the Azure key is not configured, the application falls back to browser-side OCR automatically.

**Option A** is a viable alternative if the organisation determines that even Azure-tenanted processing falls outside its IP policy, accepting the trade-off of slower, hardware-dependent performance and a large initial model download.

**Option D** should only be considered if the hosting infrastructure moves to a dedicated VM or container with GPU capability, and the team is resourced to manage the additional operational complexity.
