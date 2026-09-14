# llms.txt & llms-full.txt Reference Specification

## Canonical File Formats

### 1. `llms.txt` (Curated Index)
* **Goal**: Provide a lightweight directory of key documentation links and summaries (< 2,000 tokens).
* **Format**:
```markdown
# {Project Name}

> {Single-sentence overview blockquote}

## Overview
- [{Link Title}]({Path}): {Description}

## Key APIs & Resources
- [{API Title}]({Path}): {Description}

## Optional / Advanced
- [{Topic}]({Path}): {Description}
```

### 2. `llms-full.txt` (Concatenated Corpus)
* **Goal**: Plain-text concatenated documentation for deep RAG ingestion.
* **Format**:
  * Clean markdown without HTML tags, banners, or navigation sidebars.
  * Separated by clear markdown headers or thematic breaks (`---`).
  * Token budget capped at ~100,000 tokens.
