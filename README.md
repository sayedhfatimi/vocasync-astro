# @vocasync/astro

Turn your Astro blog posts into narrated audio with word-level synchronization.

## Features

- 🎙️ **Text-to-Speech Synthesis** - Generate natural-sounding audio narration for your content
- 🎯 **Word-Level Alignment** - Precise timestamps for every word, powered by forced alignment
- ✨ **Live Word Highlighting** - Karaoke-style highlighting that follows along with playback
- 🎛️ **Built-in Audio Player** - Accessible player with keyboard shortcuts and mini-player mode
- 🌍 **57 Languages** - Global reach with support for 57 languages
- 🎨 **Fully Themeable** - CSS variables for seamless integration with any design

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Components](#components)
- [Supported Languages](#supported-languages)
- [Math Support](#math-support)
- [Deployment](#deployment)
- [Important: Audio Map](#important-audio-map)
- [Customizing Styles](#customizing-styles)

## Installation

```bash
npm install @vocasync/astro
# or
bun add @vocasync/astro
# or
pnpm add @vocasync/astro
```

## Quick Start

### 1. Create VocaSync Config

Create a `vocasync.config.mjs` file in your project root:

```javascript
// vocasync.config.mjs
export default {
  collection: {
    name: "blog",              // Your content collection name
    path: "./src/content/blog", // Path to your content
  },
};
```

### 2. Add to Astro Config

Update your `astro.config.mjs`:

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import vocasync from "@vocasync/astro";
import { rehypeAudioWords } from "@vocasync/astro/rehype";

export default defineConfig({
  markdown: {
    rehypePlugins: [
      [rehypeAudioWords, {
        collectionName: "blog",                    // Must match your collection name
        audioMapPath: "src/data/audio-map.json"   // Must match output.audioMapPath
      }]
    ]
  },
  integrations: [vocasync()],
});
```

### 3. Set API Key

Create a `.env` file:

```bash
VOCASYNC_API_KEY=voca_xxxxxxxxxxxxxxxx
```

Get your API key at [vocasync.io](https://vocasync.io)

### 4. Create Audio Map Directory

```bash
mkdir -p src/data
```

### 5. Sync Your Content

```bash
npx vocasync sync
```

This will:
- Read all content from your collection
- Submit synthesis jobs to VocaSync API
- Wait for processing to complete
- Save metadata to `audio-map.json`

### 6. Add the Player Component

In your article layout or page:

```astro
---
// src/layouts/ArticleLayout.astro
import { AudioPlayer } from "@vocasync/astro/components";

const { post } = Astro.props;
---

<article>
  <!-- Audio player at the top -->
  <AudioPlayer slug={post.slug} label="Listen to this post" />
  
  <!-- Article content - must have data-article-body for word highlighting -->
  <div data-article-body>
    <slot />
  </div>
</article>
```

## Project Structure

After setup, your project should look like this:

```
my-astro-site/
├── astro.config.mjs          # Astro config with vocasync integration
├── vocasync.config.mjs       # VocaSync configuration
├── .env                      # API key (add to .gitignore)
├── src/
│   ├── content/
│   │   └── blog/             # Your content collection
│   │       ├── my-post.md
│   │       └── another-post.md
│   ├── data/
│   │   └── audio-map.json    # Generated - DO NOT DELETE (see below)
│   └── layouts/
│       └── ArticleLayout.astro
└── package.json
```

## Configuration

### vocasync.config.mjs

Full configuration options:

```javascript
// vocasync.config.mjs
export default {
  // Content collection settings (required)
  collection: {
    name: "blog",                    // Collection name
    path: "./src/content/blog",      // Path to content files
    slugField: "slug",               // Frontmatter field for slug (optional)
  },
  
  // Language for synthesis and alignment (ISO 639-1 code)
  // See "Supported Languages" section below for all options
  language: "en",
  
  // Synthesis settings
  synthesis: {
    voice: "onyx",                   // alloy, echo, fable, onyx, nova, shimmer
    quality: "sd",                   // sd (standard) or hd (high definition)
    format: "mp3",                   // mp3, opus, aac, flac
  },
  
  // LaTeX/math support
  math: {
    enabled: false,                  // Enable math-to-speech conversion
    style: "clearspeak",             // clearspeak or mathspeak
  },
  
  // Output settings
  output: {
    audioMapPath: "./src/data/audio-map.json",
  },
  
  // Frontmatter field to opt-in/out per post
  frontmatterField: "audio",         // Set `audio: false` in frontmatter to skip
  
  // Processing options
  processing: {
    concurrency: 3,                  // Parallel jobs (1-10)
    force: false,                    // Force reprocessing
  },
};
```

### Rehype Plugin Options

```javascript
// In astro.config.mjs
[rehypeAudioWords, {
  collectionName: "blog",                  // Content collection name
  audioMapPath: "src/data/audio-map.json", // Path to audio map
  classPrefix: "vocasync",                 // CSS class prefix (default: "vocasync")
}]
```

## CLI Commands

```bash
# Sync all content (synthesis + alignment)
npx vocasync sync

# Sync a single post
npx vocasync sync --only my-post-slug

# Force reprocessing (ignores cache)
npx vocasync sync --force

# Dry run (preview without API calls)
npx vocasync sync --dry-run

# Use a custom config file
npx vocasync sync --config ./path/to/vocasync.config.mjs

# Check configuration
npx vocasync check

# Check job status
npx vocasync status <projectUuid>

# Show help
npx vocasync help
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--only <slug>` | Only process a specific post by slug |
| `--force` | Force reprocessing, ignore cache |
| `--dry-run` | Preview what would be processed without API calls |
| `--config <path>` | Use a custom config file path |

## Components

### AudioPlayer

The main audio player component with word highlighting support.

```astro
---
import { AudioPlayer } from "@vocasync/astro/components";
---

<AudioPlayer
  slug={post.slug}
  label="Listen to this post"
  articleSelector="[data-article-body]"
  enableHighlighting={true}
  enableMiniPlayer={true}
  trailLength={4}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `slug` | `string` | required | Post slug to lookup audio |
| `label` | `string` | `"Listen to this post"` | Accessible label |
| `showPlaceholder` | `boolean` | `true` | Show message when no audio |
| `class` | `string` | `""` | Additional CSS classes |
| `articleSelector` | `string` | `"[data-article-body]"` | Selector for word highlighting container |
| `enableMiniPlayer` | `boolean` | `true` | Show floating mini player on scroll |
| `enableHighlighting` | `boolean` | `true` | Enable word highlighting |
| `trailLength` | `number` | `4` | Number of trailing highlighted words |

#### Keyboard Shortcuts

When the player is focused (click on it or Tab to it), the following keyboard shortcuts are available:

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` Left Arrow | Seek backward 5 seconds |
| `→` Right Arrow | Seek forward 5 seconds |
| `M` | Toggle mute |
| `H` | Toggle word highlighting |

#### Highlighting Toggle

The player includes a highlighter icon button that allows users to toggle word highlighting on/off during playback. This is useful for users who find the highlighting distracting or prefer to just listen.

### Word Highlighting

For word highlighting to work, wrap your article content with `data-article-body`:

```astro
<div data-article-body>
  <Content />  <!-- Your markdown content -->
</div>
```

The rehype plugin wraps each word in a `<span>` with timing data at build time.

## Supported Languages

VocaSync supports 57 languages using ISO 639-1 codes:

| Code | Language | Code | Language | Code | Language |
|------|----------|------|----------|------|----------|
| `af` | Afrikaans | `hu` | Hungarian | `pl` | Polish |
| `ar` | Arabic | `is` | Icelandic | `pt` | Portuguese |
| `hy` | Armenian | `id` | Indonesian | `ro` | Romanian |
| `az` | Azerbaijani | `it` | Italian | `ru` | Russian |
| `be` | Belarusian | `ja` | Japanese | `sr` | Serbian |
| `bs` | Bosnian | `kn` | Kannada | `sk` | Slovak |
| `bg` | Bulgarian | `kk` | Kazakh | `sl` | Slovenian |
| `ca` | Catalan | `ko` | Korean | `es` | Spanish |
| `zh` | Chinese | `lv` | Latvian | `sw` | Swahili |
| `hr` | Croatian | `lt` | Lithuanian | `sv` | Swedish |
| `cs` | Czech | `mk` | Macedonian | `tl` | Tagalog |
| `da` | Danish | `ms` | Malay | `ta` | Tamil |
| `nl` | Dutch | `mr` | Marathi | `th` | Thai |
| `en` | English | `mi` | Māori | `tr` | Turkish |
| `et` | Estonian | `ne` | Nepali | `uk` | Ukrainian |
| `fi` | Finnish | `no` | Norwegian | `ur` | Urdu |
| `fr` | French | `fa` | Persian | `vi` | Vietnamese |
| `gl` | Galician | | | `cy` | Welsh |
| `de` | German | | | | |
| `el` | Greek | | | | |
| `he` | Hebrew | | | | |
| `hi` | Hindi | | | | |

## Math Support

VocaSync supports LaTeX math equations using [Speech Rule Engine](https://github.com/zorkow/speech-rule-engine) to convert math to spoken text.

### Installation

Install the optional dependency:

```bash
npm install latex-to-speech
```

### Setup

For math to work with word highlighting, you need additional plugins that run in a specific order:

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import vocasync from "@vocasync/astro";
import { rehypeAudioWords, rehypeMathSpeech, remarkMathSpeech } from "@vocasync/astro/rehype";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex"; // or rehype-mathjax

export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkMath,           // 1. Parse LaTeX syntax
      remarkMathSpeech,     // 2. Collect math expressions
    ],
    rehypePlugins: [
      rehypeKatex,          // 3. Render math to HTML
      rehypeMathSpeech,     // 4. Inject hidden spoken text
      [rehypeAudioWords, {  // 5. Wrap words with timing (runs last)
        collectionName: "blog",
        audioMapPath: "src/data/audio-map.json"
      }]
    ]
  },
  integrations: [vocasync()],
});
```

### How It Works

1. **remarkMathSpeech** collects all LaTeX expressions during markdown parsing
2. **rehypeKatex/rehypeMathjax** renders the math to visual HTML
3. **rehypeMathSpeech** converts LaTeX to spoken text (e.g., `$x^2$` → "x squared") and injects it as hidden `<span>` elements
4. **rehypeAudioWords** wraps all text (including the spoken math) with timing spans

The spoken text is visually hidden (`sr-only`) but gets highlighted during audio playback.

### Configuration

Set the speech style in `vocasync.config.mjs`:

```javascript
export default {
  // ...
  math: {
    enabled: true,
    style: "clearspeak",  // or "mathspeak"
  },
};
```

- **clearspeak**: Natural, conversational style (recommended)
- **mathspeak**: More formal, precise mathematical speech

## Deployment

### Build Strategy

#### For Large Content Collections

If you have many posts, we recommend running `npx vocasync sync` **once locally** before your first deployment:

```bash
# Run locally to generate all audio (may take a while)
npx vocasync sync

# Commit the audio-map to version control
git add src/data/audio-map.json
git commit -m "Add audio map"
git push
```

This approach:
- Prevents long CI/CD build times (important for platforms like Vercel with time limits)
- Only new or changed posts will be processed on subsequent builds
- Audio map acts as a cache - existing entries are skipped

#### For New/Updated Posts

For ongoing updates, include the sync command in your build script:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "npx vocasync sync && astro build",
    "preview": "astro preview"
  }
}
```

Since most builds only process new or changed content, this adds minimal time.

### CI/CD Environment Variables

Make sure to set `VOCASYNC_API_KEY` in your deployment environment:

- **Vercel**: Settings → Environment Variables
- **Netlify**: Site settings → Environment variables
- **GitHub Actions**: Repository secrets

### Example GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      - run: bun run build
        env:
          VOCASYNC_API_KEY: ${{ secrets.VOCASYNC_API_KEY }}
      
      - name: Deploy
        # Your deploy step here
```

## Important: Audio Map

### What is audio-map.json?

The `audio-map.json` file is the **source of truth** for VocaSync. It stores:

- Project UUIDs for each synced article
- Content hashes (to detect changes)
- Audio and alignment URLs
- Timestamps

### ⚠️ Do Not Delete

**If you delete `audio-map.json`, running `npx vocasync sync` will re-create synthesis and alignment jobs for ALL content.** This will:

1. Incur API costs for re-processing everything
2. Generate new audio files (old URLs will still work)

### Best Practices

1. **Commit to version control**: Add `audio-map.json` to git
2. **Back it up**: Keep a backup before major changes
3. **Don't edit manually**: Let the CLI manage this file

```bash
# Add to git
git add src/data/audio-map.json
git commit -m "Add audio map"
```

### What to Ignore

Add your `.env` file to `.gitignore`:

```gitignore
# .gitignore
.env
.env.local
```

## Customizing Styles

Override CSS variables to match your theme:

```css
:root {
  /* Player colors */
  --vocasync-primary: #3b82f6;
  --vocasync-primary-content: white;
  --vocasync-surface: #f8fafc;
  --vocasync-border: #e2e8f0;
  --vocasync-text: #1e293b;
  --vocasync-text-muted: #64748b;
  
  /* Word highlighting */
  --vocasync-highlight: #10b981;
  --vocasync-highlight-text: white;
  --vocasync-highlight-active-opacity: 0.25;
  --vocasync-highlight-trail-opacity: 0.12;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --vocasync-surface: #1e293b;
    --vocasync-border: #334155;
    --vocasync-text: #f1f5f9;
    --vocasync-text-muted: #94a3b8;
  }
}
```

## Troubleshooting

### "No VocaSync configuration found"

Create a `vocasync.config.mjs` file in your project root.

### Words not highlighting

1. Make sure the rehype plugin is configured in `astro.config.mjs`
2. Check that `collectionName` matches your collection
3. Verify `audioMapPath` points to your audio map
4. Ensure content is wrapped in `[data-article-body]`

### Audio not playing

1. Run `npx vocasync sync` to generate audio
2. Check that `audio-map.json` exists and has entries
3. Verify the `slug` prop matches your content slug

### CLI errors

```bash
# Check your configuration
npx vocasync check

# Verify API key is set
echo $VOCASYNC_API_KEY
```

## License

MIT
