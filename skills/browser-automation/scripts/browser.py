#!/usr/bin/env python3
"""
Browser Automation - Web scraping and automation tool

This script provides browser automation capabilities using Playwright:
1. Take screenshots of web pages
2. Extract text content from URLs
3. Fill forms and click elements
4. Monitor website changes
"""

import argparse
import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

# Try to import playwright
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Warning: playwright not installed. Run: pip install playwright")


async def take_screenshot(url: str, output_path: Optional[str] = None, 
                         full_page: bool = False, width: int = 1280, height: int = 720) -> Dict[str, Any]:
    """Take a screenshot of a web page."""
    if not PLAYWRIGHT_AVAILABLE:
        return {'error': 'playwright not installed'}
    
    if not output_path:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = f'screenshot_{timestamp}.png'
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': width, 'height': height})
        
        try:
            await page.goto(url, wait_until='networkidle')
            await page.screenshot(path=output_path, full_page=full_page)
            await browser.close()
            
            return {
                'success': True,
                'url': url,
                'output_path': output_path,
                'full_page': full_page,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            await browser.close()
            return {'error': str(e)}


async def extract_content(url: str, selector: Optional[str] = None) -> Dict[str, Any]:
    """Extract text content from a web page."""
    if not PLAYWRIGHT_AVAILABLE:
        return {'error': 'playwright not installed'}
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        try:
            await page.goto(url, wait_until='networkidle')
            
            if selector:
                # Extract specific element
                element = await page.query_selector(selector)
                if element:
                    text = await element.text_content()
                    html = await element.inner_html()
                else:
                    text = ''
                    html = ''
            else:
                # Extract full page content
                text = await page.text_content('body')
                html = await page.content()
            
            # Get page title
            title = await page.title()
            
            await browser.close()
            
            return {
                'success': True,
                'url': url,
                'title': title,
                'text': text.strip() if text else '',
                'html': html if html else '',
                'selector': selector,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            await browser.close()
            return {'error': str(e)}


async def monitor_website(url: str, check_type: str = 'content', 
                         selector: Optional[str] = None) -> Dict[str, Any]:
    """Monitor a website for changes."""
    if not PLAYWRIGHT_AVAILABLE:
        return {'error': 'playwright not installed'}
    
    # This is a simplified version - in production, you'd store and compare hashes
    result = await extract_content(url, selector)
    
    if 'error' in result:
        return result
    
    # Generate a simple hash of the content
    import hashlib
    content_hash = hashlib.md5(result['text'].encode()).hexdigest()
    
    return {
        'success': True,
        'url': url,
        'check_type': check_type,
        'selector': selector,
        'content_hash': content_hash,
        'content_length': len(result['text']),
        'title': result['title'],
        'timestamp': datetime.now().isoformat()
    }


def main():
    parser = argparse.ArgumentParser(description='Browser Automation Tool')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Screenshot command
    screenshot_parser = subparsers.add_parser('screenshot', help='Take a screenshot')
    screenshot_parser.add_argument('url', help='URL to screenshot')
    screenshot_parser.add_argument('-o', '--output', help='Output file path')
    screenshot_parser.add_argument('--full-page', action='store_true', help='Capture full page')
    screenshot_parser.add_argument('--width', type=int, default=1280, help='Viewport width')
    screenshot_parser.add_argument('--height', type=int, default=720, help='Viewport height')
    
    # Extract command
    extract_parser = subparsers.add_parser('extract', help='Extract content from URL')
    extract_parser.add_argument('url', help='URL to extract from')
    extract_parser.add_argument('-s', '--selector', help='CSS selector to extract specific element')
    extract_parser.add_argument('-j', '--json', action='store_true', help='Output as JSON')
    
    # Monitor command
    monitor_parser = subparsers.add_parser('monitor', help='Monitor website for changes')
    monitor_parser.add_argument('url', help='URL to monitor')
    monitor_parser.add_argument('-t', '--type', choices=['content', 'selector'], default='content',
                               help='Type of check')
    monitor_parser.add_argument('-s', '--selector', help='CSS selector to monitor')
    
    args = parser.parse_args()
    
    if args.command == 'screenshot':
        result = asyncio.run(take_screenshot(
            args.url, args.output, args.full_page, args.width, args.height
        ))
        print(json.dumps(result, indent=2))
    
    elif args.command == 'extract':
        result = asyncio.run(extract_content(args.url, args.selector))
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            if 'error' in result:
                print(f"Error: {result['error']}")
            else:
                print(f"Title: {result['title']}")
                print(f"URL: {result['url']}")
                print("\nContent:")
                print(result['text'][:2000])  # Limit output
    
    elif args.command == 'monitor':
        result = asyncio.run(monitor_website(args.url, args.type, args.selector))
        print(json.dumps(result, indent=2))
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
