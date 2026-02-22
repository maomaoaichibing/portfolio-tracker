---
name: browser-automation
description: Web browser automation and scraping tool. Use when you need to take screenshots of web pages, extract content from URLs, monitor website changes, or perform browser automation tasks. Provides screenshot capture, text extraction, and change monitoring capabilities.
---

# Browser Automation

Web browser automation tool using Playwright for screenshots, content extraction, and website monitoring.

## When to Use This Skill

Use this skill when:
- Taking screenshots of web pages
- Extracting text content from URLs
- Monitoring website changes
- Need to capture page state for documentation
- Comparing website versions over time

## Prerequisites

Install Playwright:
```bash
pip install playwright
playwright install chromium
```

## Commands

### 1. Take Screenshot

Capture a screenshot of a web page:

```bash
# Basic screenshot
python3 scripts/browser.py screenshot https://example.com

# Full page screenshot
python3 scripts/browser.py screenshot https://example.com --full-page

# Custom viewport size
python3 scripts/browser.py screenshot https://example.com --width 1920 --height 1080

# Save to specific path
python3 scripts/browser.py screenshot https://example.com -o /path/to/screenshot.png
```

### 2. Extract Content

Extract text content from a web page:

```bash
# Extract full page content
python3 scripts/browser.py extract https://example.com

# Extract specific element
python3 scripts/browser.py extract https://example.com -s "article"

# JSON output
python3 scripts/browser.py extract https://example.com -j
```

### 3. Monitor Website

Monitor a website for changes:

```bash
# Monitor full page
python3 scripts/browser.py monitor https://example.com

# Monitor specific element
python3 scripts/browser.py monitor https://example.com -s ".price"
```

## Output Format

### Screenshot Result
```json
{
  "success": true,
  "url": "https://example.com",
  "output_path": "screenshot_20260222_200000.png",
  "full_page": false,
  "timestamp": "2026-02-22T20:00:00"
}
```

### Extract Result
```json
{
  "success": true,
  "url": "https://example.com",
  "title": "Example Domain",
  "text": "Example Domain...",
  "html": "<!DOCTYPE html>...",
  "selector": null,
  "timestamp": "2026-02-22T20:00:00"
}
```

### Monitor Result
```json
{
  "success": true,
  "url": "https://example.com",
  "check_type": "content",
  "content_hash": "abc123...",
  "content_length": 1234,
  "title": "Example Domain",
  "timestamp": "2026-02-22T20:00:00"
}
```

## Use Cases

### Documentation
Take screenshots of web interfaces for documentation:
```bash
python3 scripts/browser.py screenshot https://myapp.com/dashboard --full-page
```

### Content Monitoring
Monitor competitor pricing:
```bash
python3 scripts/browser.py monitor https://competitor.com/product -s ".price"
```

### Data Extraction
Extract article content:
```bash
python3 scripts/browser.py extract https://news-site.com/article -s "article" -j
```

## Limitations

- Requires Playwright and Chromium installation
- Some websites may block automated browsers
- JavaScript-heavy sites may need additional wait time
