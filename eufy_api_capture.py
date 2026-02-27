"""
Eufy Security Website API Capture Script
Navigates through multiple pages on eufy.com and captures all XHR/Fetch network requests.
"""

import json
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, Page, BrowserContext
from typing import Optional

# Store all captured requests
all_requests = []
page_context = {"current_page": ""}

def capture_request(request):
    """Capture details of each network request."""
    url = request.url
    resource_type = request.resource_type

    # Only capture XHR/Fetch and document requests, skip static assets
    if resource_type not in ("xhr", "fetch", "document"):
        # Also capture if URL contains API patterns
        api_patterns = ["/api/", "/v1/", "/v2/", "/graphql", ".json", "/search",
                       "/cart", "/products", "/collections", "/recommendations",
                       "/analytics", "/tracking", "/checkout", "/pricing",
                       "shopify", "algolia", "contentful", "sanity", "prismic"]
        if not any(p in url.lower() for p in api_patterns):
            return

    # Skip common tracking/analytics unless they reveal API patterns
    skip_patterns = [
        "google-analytics.com", "googletagmanager.com", "facebook.net",
        "doubleclick.net", "googleapis.com/css", "fonts.googleapis",
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
        ".css", "hotjar.com", "clarity.ms", "bing.com/bat",
    ]
    if any(p in url.lower() for p in skip_patterns):
        return

    headers = request.headers
    method = request.method
    post_data = None

    try:
        post_data = request.post_data
    except:
        pass

    req_entry = {
        "page_context": page_context["current_page"],
        "timestamp": datetime.now().isoformat(),
        "url": url,
        "method": method,
        "resource_type": resource_type,
        "headers": dict(headers) if headers else {},
        "post_data": post_data,
        "response_status": None,
        "response_headers": None,
        "response_body_preview": None,
    }
    all_requests.append(req_entry)


def capture_response(response):
    """Capture response details for matching requests."""
    url = response.url

    # Find the matching request entry
    for req in reversed(all_requests):
        if req["url"] == url and req["response_status"] is None:
            req["response_status"] = response.status
            try:
                resp_headers = response.headers
                req["response_headers"] = dict(resp_headers) if resp_headers else {}
            except:
                pass
            try:
                body = response.text()
                req["response_body_preview"] = body[:2000] if body else None
            except:
                try:
                    body = response.body()
                    req["response_body_preview"] = body[:2000].decode('utf-8', errors='replace') if body else None
                except:
                    req["response_body_preview"] = "[Binary or unavailable]"
            break


def wait_and_scroll(page: Page, wait_time: float = 3.0):
    """Wait for page load and scroll to trigger lazy loading."""
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(wait_time)
    # Scroll down to trigger lazy loaded content
    page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
    time.sleep(1)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
    time.sleep(1)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(2)
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(1)


def main():
    with sync_playwright() as p:
        # Launch Chromium (not Edge) in headed mode
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
        )
        page = context.new_page()

        # Set up network interception
        page.on("request", capture_request)
        page.on("response", capture_response)

        # =====================================================
        # PAGE 1: Main Security Cameras Listing
        # =====================================================
        print("\n[1/6] Navigating to main security page...")
        page_context["current_page"] = "security_main_listing"
        try:
            page.goto("https://www.eufy.com/eufy-security", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
            print(f"  Captured {len(all_requests)} requests so far")
        except Exception as e:
            print(f"  Error: {e}")

        # =====================================================
        # PAGE 2: Individual Product Page - eufyCam S4 Pro
        # =====================================================
        print("\n[2/6] Navigating to eufyCam product page...")
        page_context["current_page"] = "product_eufycam"
        count_before = len(all_requests)
        try:
            # Try direct navigation to a known product
            page.goto("https://www.eufy.com/products/t8873", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
        except:
            try:
                page.goto("https://www.eufy.com/eufycam-s4-pro", wait_until="domcontentloaded", timeout=30000)
                wait_and_scroll(page)
            except:
                try:
                    page.goto("https://www.eufy.com/eufycam", wait_until="domcontentloaded", timeout=30000)
                    wait_and_scroll(page)
                except Exception as e:
                    print(f"  Error: {e}")
        print(f"  Captured {len(all_requests) - count_before} new requests")

        # =====================================================
        # PAGE 3: Bundle/Kit page
        # =====================================================
        print("\n[3/6] Navigating to bundles/kits page...")
        page_context["current_page"] = "bundles_kits"
        count_before = len(all_requests)
        try:
            page.goto("https://www.eufy.com/collections/security-kits", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
        except:
            try:
                page.goto("https://www.eufy.com/security-camera-kit", wait_until="domcontentloaded", timeout=30000)
                wait_and_scroll(page)
            except Exception as e:
                print(f"  Error: {e}")
        print(f"  Captured {len(all_requests) - count_before} new requests")

        # =====================================================
        # PAGE 4: Deals/Promotions page
        # =====================================================
        print("\n[4/6] Navigating to deals page...")
        page_context["current_page"] = "deals_promotions"
        count_before = len(all_requests)
        try:
            page.goto("https://www.eufy.com/deals", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
        except:
            try:
                page.goto("https://www.eufy.com/promotions", wait_until="domcontentloaded", timeout=30000)
                wait_and_scroll(page)
            except Exception as e:
                print(f"  Error: {e}")
        print(f"  Captured {len(all_requests) - count_before} new requests")

        # =====================================================
        # PAGE 5: Search for "S4 camera"
        # =====================================================
        print("\n[5/6] Performing site search for 'S4 camera'...")
        page_context["current_page"] = "search_s4_camera"
        count_before = len(all_requests)
        try:
            # Try search URL patterns common on Shopify/headless sites
            page.goto("https://www.eufy.com/search?q=S4+camera", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
        except:
            try:
                page.goto("https://www.eufy.com/pages/search-results?q=S4+camera", wait_until="domcontentloaded", timeout=30000)
                wait_and_scroll(page)
            except:
                try:
                    # Navigate back to main page and use search bar
                    page.goto("https://www.eufy.com/eufy-security", wait_until="domcontentloaded", timeout=30000)
                    time.sleep(2)
                    # Try to find and click search icon
                    search_selectors = [
                        'button[aria-label="Search"]',
                        '.search-icon', '.header-search',
                        'a[href*="search"]', '[data-action="search"]',
                        'input[type="search"]', '#search',
                    ]
                    for sel in search_selectors:
                        try:
                            el = page.query_selector(sel)
                            if el:
                                el.click()
                                time.sleep(1)
                                break
                        except:
                            continue
                    # Type search query
                    search_input_selectors = [
                        'input[type="search"]', 'input[name="q"]',
                        'input[placeholder*="earch"]', '#search-input',
                        '.search-input input',
                    ]
                    for sel in search_input_selectors:
                        try:
                            el = page.query_selector(sel)
                            if el:
                                el.fill("S4 camera")
                                time.sleep(0.5)
                                el.press("Enter")
                                time.sleep(3)
                                break
                        except:
                            continue
                    wait_and_scroll(page)
                except Exception as e:
                    print(f"  Error: {e}")
        print(f"  Captured {len(all_requests) - count_before} new requests")

        # =====================================================
        # PAGE 6: Cart/Pricing
        # =====================================================
        print("\n[6/6] Checking cart/pricing...")
        page_context["current_page"] = "cart_pricing"
        count_before = len(all_requests)
        try:
            page.goto("https://www.eufy.com/cart", wait_until="domcontentloaded", timeout=30000)
            wait_and_scroll(page)
        except Exception as e:
            print(f"  Error navigating to cart: {e}")

        # Also try to add a product to cart via API
        try:
            # Navigate to a product and try to add to cart
            page.goto("https://www.eufy.com/products/t8873", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)
            # Look for Add to Cart button
            atc_selectors = [
                'button:has-text("Add to Cart")',
                'button:has-text("Add To Cart")',
                '[data-action="add-to-cart"]',
                '.add-to-cart', '#add-to-cart',
                'button[name="add"]',
            ]
            for sel in atc_selectors:
                try:
                    btn = page.query_selector(sel)
                    if btn and btn.is_visible():
                        btn.click()
                        time.sleep(3)
                        break
                except:
                    continue
        except Exception as e:
            print(f"  Error with add-to-cart: {e}")

        print(f"  Captured {len(all_requests) - count_before} new requests")

        # =====================================================
        # ADDITIONAL: Try direct API endpoint discovery
        # =====================================================
        print("\n[BONUS] Probing common API endpoints...")
        page_context["current_page"] = "api_discovery"
        count_before = len(all_requests)

        api_probes = [
            "https://www.eufy.com/api/products",
            "https://www.eufy.com/api/collections",
            "https://www.eufy.com/products.json",
            "https://www.eufy.com/collections.json",
            "https://www.eufy.com/collections/all/products.json",
            "https://www.eufy.com/collections/security-cameras/products.json",
            "https://www.eufy.com/cart.json",
            "https://www.eufy.com/cart.js",
            "https://www.eufy.com/search/suggest.json?q=camera",
            "https://www.eufy.com/api/2024-01/graphql.json",
        ]

        for probe_url in api_probes:
            try:
                resp = page.evaluate(f"""
                    async () => {{
                        try {{
                            const resp = await fetch("{probe_url}");
                            const text = await resp.text();
                            return {{
                                status: resp.status,
                                headers: Object.fromEntries(resp.headers.entries()),
                                body: text.substring(0, 2000),
                                url: resp.url
                            }};
                        }} catch(e) {{
                            return {{ error: e.message, url: "{probe_url}" }};
                        }}
                    }}
                """)
                if resp and not resp.get("error"):
                    all_requests.append({
                        "page_context": "api_discovery_probe",
                        "timestamp": datetime.now().isoformat(),
                        "url": probe_url,
                        "method": "GET",
                        "resource_type": "fetch_probe",
                        "headers": {},
                        "post_data": None,
                        "response_status": resp.get("status"),
                        "response_headers": resp.get("headers", {}),
                        "response_body_preview": resp.get("body", ""),
                    })
            except Exception as e:
                print(f"  Probe {probe_url}: {e}")

        print(f"  Captured {len(all_requests) - count_before} new probe responses")

        # =====================================================
        # Additional Shopify-specific API probing
        # =====================================================
        print("\n[BONUS 2] Probing Shopify-specific endpoints...")
        page_context["current_page"] = "shopify_api_discovery"
        count_before = len(all_requests)

        shopify_probes = [
            "https://www.eufy.com/collections/eufy-security/products.json",
            "https://www.eufy.com/collections/security-cameras/products.json?limit=250",
            "https://www.eufy.com/search/suggest.json?q=camera&resources[type]=product",
            "https://www.eufy.com/recommendations/products.json?product_id=1",
            "https://www.eufy.com/admin/api/2024-01/products.json",
        ]

        for probe_url in shopify_probes:
            try:
                resp = page.evaluate(f"""
                    async () => {{
                        try {{
                            const resp = await fetch("{probe_url}");
                            const text = await resp.text();
                            return {{
                                status: resp.status,
                                headers: Object.fromEntries(resp.headers.entries()),
                                body: text.substring(0, 2000),
                                url: resp.url
                            }};
                        }} catch(e) {{
                            return {{ error: e.message, url: "{probe_url}" }};
                        }}
                    }}
                """)
                if resp and not resp.get("error"):
                    all_requests.append({
                        "page_context": "shopify_api_probe",
                        "timestamp": datetime.now().isoformat(),
                        "url": probe_url,
                        "method": "GET",
                        "resource_type": "fetch_probe",
                        "headers": {},
                        "post_data": None,
                        "response_status": resp.get("status"),
                        "response_headers": resp.get("headers", {}),
                        "response_body_preview": resp.get("body", ""),
                    })
            except Exception as e:
                print(f"  Probe {probe_url}: {e}")

        print(f"  Captured {len(all_requests) - count_before} new Shopify probe responses")

        browser.close()

    # =====================================================
    # SAVE RESULTS
    # =====================================================
    print(f"\n{'='*60}")
    print(f"Total captured requests: {len(all_requests)}")

    # Save full data
    output_path = "/Users/rajuroopani/claude-teams-bot/eufy_api_capture_results.json"
    with open(output_path, "w") as f:
        json.dump(all_requests, f, indent=2, default=str)
    print(f"Full results saved to: {output_path}")

    # Create a summary of unique API endpoints
    unique_endpoints = {}
    for req in all_requests:
        # Normalize URL by removing query params for grouping
        base_url = req["url"].split("?")[0]
        key = f"{req['method']} {base_url}"
        if key not in unique_endpoints:
            unique_endpoints[key] = {
                "url": req["url"],
                "base_url": base_url,
                "method": req["method"],
                "resource_type": req["resource_type"],
                "page_contexts": [req["page_context"]],
                "response_status": req["response_status"],
                "response_body_preview": req.get("response_body_preview", "")[:500] if req.get("response_body_preview") else None,
                "interesting_headers": {},
                "post_data": req.get("post_data"),
                "count": 1,
            }
            # Extract interesting headers
            for h_key, h_val in req.get("headers", {}).items():
                h_lower = h_key.lower()
                if any(x in h_lower for x in ["auth", "token", "api", "x-", "cookie", "content-type"]):
                    unique_endpoints[key]["interesting_headers"][h_key] = h_val[:200] if h_val else ""
        else:
            unique_endpoints[key]["count"] += 1
            if req["page_context"] not in unique_endpoints[key]["page_contexts"]:
                unique_endpoints[key]["page_contexts"].append(req["page_context"])

    summary_path = "/Users/rajuroopani/claude-teams-bot/eufy_api_summary.json"
    with open(summary_path, "w") as f:
        json.dump(unique_endpoints, f, indent=2, default=str)
    print(f"Summary saved to: {summary_path}")

    # Print summary
    print(f"\nUnique endpoints discovered: {len(unique_endpoints)}")
    print("\n--- API ENDPOINTS SUMMARY ---\n")

    # Categorize endpoints
    categories = {
        "API/GraphQL": [],
        "Shopify/Commerce": [],
        "Search": [],
        "Analytics/Tracking": [],
        "CDN/Content": [],
        "Other": [],
    }

    for key, data in unique_endpoints.items():
        url = data["url"].lower()
        if "/api/" in url or "/graphql" in url or "/v1/" in url or "/v2/" in url:
            categories["API/GraphQL"].append((key, data))
        elif "shopify" in url or "/cart" in url or "/products" in url or "/collections" in url or ".json" in url or "/checkout" in url:
            categories["Shopify/Commerce"].append((key, data))
        elif "search" in url or "algolia" in url or "suggest" in url:
            categories["Search"].append((key, data))
        elif "analytics" in url or "track" in url or "pixel" in url or "gtm" in url or "segment" in url:
            categories["Analytics/Tracking"].append((key, data))
        elif "cdn" in url or "cloudfront" in url or "cloudinary" in url or "imgix" in url:
            categories["CDN/Content"].append((key, data))
        else:
            categories["Other"].append((key, data))

    for cat_name, endpoints in categories.items():
        if endpoints:
            print(f"\n=== {cat_name} ({len(endpoints)} endpoints) ===")
            for key, data in endpoints:
                print(f"\n  {key}")
                print(f"    Status: {data['response_status']}")
                print(f"    Pages: {', '.join(data['page_contexts'])}")
                print(f"    Count: {data['count']}")
                if data.get("interesting_headers"):
                    print(f"    Headers: {json.dumps(data['interesting_headers'], indent=6)[:300]}")
                if data.get("post_data"):
                    print(f"    Post Data: {str(data['post_data'])[:200]}")
                if data.get("response_body_preview"):
                    preview = str(data["response_body_preview"])[:300]
                    print(f"    Response Preview: {preview}")


if __name__ == "__main__":
    main()
