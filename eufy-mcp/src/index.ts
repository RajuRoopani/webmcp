#!/usr/bin/env node
/**
 * Eufy Security MCP Server
 * Reverse-engineered from eufy.com network traffic.
 *
 * APIs used:
 *  - Shopify Storefront GraphQL  https://us.eufy.com/api/2025-07/graphql.json
 *  - Coupons (all)               https://www.eufy.com/api/multipass/shopifyservices/coupons/by_shop
 *  - Coupons (by SKU)            https://www.eufy.com/api/multipass/shopifyservices/coupons/by_skus
 *  - Popular products            https://rainbowbridge.anker.com/api/v2/personalize/relation/popular
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Constants ─────────────────────────────────────────────────────────────────

const SHOPIFY_GRAPHQL_URL = "https://us.eufy.com/api/2025-07/graphql.json";
const STOREFRONT_TOKEN = "92301d516a0a38a0a483bc230e5bfaad";
const SHOPIFY_DOMAIN = "eufy-us.myshopify.com";
const COUPONS_BASE = "https://www.eufy.com/api/multipass/shopifyservices/coupons";
const RAINBOW_BASE = "https://rainbowbridge.anker.com/api/v2/personalize/relation";

// ─── GraphQL Queries (captured from live network traffic) ──────────────────────

const SEARCH_QUERY = `
  query SearchQuery(
    $query: String!,
    $first: Int,
    $sortKey: SearchSortKeys,
    $types: [SearchType!]
  ) {
    search(query: $query, first: $first, sortKey: $sortKey, types: $types) {
      totalCount
      edges {
        node {
          ... on Product {
            id
            handle
            title
            availableForSale
            productType
            tags
            priceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            compareAtPriceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            images(first: 1) {
              edges { node { url altText } }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price { amount currencyCode }
                  compareAtPrice { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_QUERY = `
  query getProductBySlug($slug: String!) {
    productByHandle(handle: $slug) {
      id
      handle
      title
      availableForSale
      productType
      vendor
      description
      totalInventory
      tags
      onlineStoreUrl
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      compareAtPriceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      images(first: 5) {
        edges { node { url altText } }
      }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            sku
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const GET_COLLECTION_QUERY = `
  query getCollectionByHandle(
    $handle: String!,
    $first: Int,
    $sortKey: ProductCollectionSortKeys
  ) {
    collectionByHandle(handle: $handle) {
      id
      handle
      title
      products(first: $first, sortKey: $sortKey) {
        pageInfo { hasNextPage hasPreviousPage }
        edges {
          node {
            id
            handle
            title
            availableForSale
            productType
            tags
            priceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            compareAtPriceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            images(first: 1) {
              edges { node { url altText } }
            }
            variants(first: 3) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function shopifyGql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(SHOPIFY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-storefront-access-token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GQL error: ${res.status} ${res.statusText}`);
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

interface PriceRange {
  minVariantPrice: { amount: string; currencyCode: string };
  maxVariantPrice: { amount: string; currencyCode: string };
}

function formatPrice(range: PriceRange) {
  const min = parseFloat(range.minVariantPrice.amount);
  const max = parseFloat(range.maxVariantPrice.amount);
  const sym = range.minVariantPrice.currencyCode === "USD" ? "$" : range.minVariantPrice.currencyCode;
  return min === max ? `${sym}${min.toFixed(2)}` : `${sym}${min.toFixed(2)} – ${sym}${max.toFixed(2)}`;
}

function formatProductSummary(node: Record<string, unknown>): string {
  const price = formatPrice(node.priceRange as PriceRange);
  let compareAt = "";
  const cap = node.compareAtPriceRange as PriceRange | null;
  if (cap) {
    const orig = parseFloat(cap.maxVariantPrice.amount);
    const curr = parseFloat((node.priceRange as PriceRange).maxVariantPrice.amount);
    if (orig > curr) compareAt = ` (was ${formatPrice(cap)})`;
  }
  const available = node.availableForSale ? "In Stock" : "Out of Stock";
  const url = `https://www.eufy.com/products/${node.handle}`;
  return `**${node.title}**\nPrice: ${price}${compareAt}\nStatus: ${available}\nURL: ${url}`;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "eufy-security",
  version: "1.0.0",
});

// Tool 1: Search products
server.tool(
  "search_products",
  "Search Eufy's product catalog by keyword (e.g. 'S4 camera', 'indoor cam', 'doorbell'). Returns matching products with prices.",
  {
    query: z.string().describe("Search keyword or product name"),
    limit: z.number().int().min(1).max(20).default(8).describe("Max results to return"),
  },
  async ({ query, limit }) => {
    const data = await shopifyGql(SEARCH_QUERY, {
      query,
      first: limit,
      sortKey: "RELEVANCE",
      types: ["PRODUCT"],
    }) as { search: { totalCount: number; edges: Array<{ node: Record<string, unknown> }> } };

    const results = data.search.edges.map(({ node }) => formatProductSummary(node));
    const total = data.search.totalCount;

    return {
      content: [{
        type: "text",
        text: `Found ${total} products for "${query}" (showing ${results.length}):\n\n${results.join("\n\n---\n\n")}`,
      }],
    };
  }
);

// Tool 2: Get product detail
server.tool(
  "get_product",
  "Get full details for a specific Eufy product by its handle/slug (e.g. 't8l02121', 'eufycam-s4'). Includes all variants, pricing, and availability.",
  {
    handle: z.string().describe("Product handle/slug from the URL (e.g. 't8l02121' from eufy.com/products/t8l02121)"),
  },
  async ({ handle }) => {
    const data = await shopifyGql(GET_PRODUCT_QUERY, { slug: handle }) as {
      productByHandle: Record<string, unknown> | null
    };

    if (!data.productByHandle) {
      return { content: [{ type: "text", text: `No product found with handle: ${handle}` }] };
    }

    const p = data.productByHandle;
    const variants = (p.variants as { edges: Array<{ node: Record<string, unknown> }> }).edges
      .map(({ node: v }) => {
        const price = (v.price as { amount: string }).amount;
        const cap = v.compareAtPrice as { amount: string } | null;
        const wasStr = cap && parseFloat(cap.amount) > parseFloat(price)
          ? ` (was $${parseFloat(cap.amount).toFixed(2)})` : "";
        const sku = v.sku ? ` [SKU: ${v.sku}]` : "";
        const avail = v.availableForSale ? "✓" : "✗";
        return `  ${avail} ${v.title}${sku}: $${parseFloat(price).toFixed(2)}${wasStr}`;
      })
      .join("\n");

    const tags = (p.tags as string[]).join(", ");
    const url = `https://www.eufy.com/products/${p.handle}`;

    return {
      content: [{
        type: "text",
        text: [
          `## ${p.title}`,
          `**Type:** ${p.productType}  |  **Brand:** ${p.vendor}`,
          `**URL:** ${url}`,
          `**Available:** ${p.availableForSale ? "Yes" : "No"} (${p.totalInventory} in stock)`,
          `**Price Range:** ${formatPrice(p.priceRange as PriceRange)}`,
          `**Tags:** ${tags}`,
          ``,
          `**Description:**`,
          p.description,
          ``,
          `**Variants:**`,
          variants,
        ].join("\n"),
      }],
    };
  }
);

// Tool 3: List collection
server.tool(
  "list_collection",
  "Browse a Eufy product collection by handle. Common handles: 'eufy-security', 'security-cameras', 'security-kits', 'indoor-security-camera', 'video-doorbell'.",
  {
    handle: z.string().describe("Collection handle (e.g. 'security-cameras', 'security-kits')"),
    limit: z.number().int().min(1).max(50).default(20).describe("Max products to return"),
    sort: z.enum(["COLLECTION_DEFAULT", "PRICE", "BEST_SELLING", "TITLE", "CREATED"]).default("COLLECTION_DEFAULT"),
  },
  async ({ handle, limit, sort }) => {
    const data = await shopifyGql(GET_COLLECTION_QUERY, {
      handle,
      first: limit,
      sortKey: sort,
    }) as { collectionByHandle: { title: string; products: { edges: Array<{ node: Record<string, unknown> }> } } | null };

    if (!data.collectionByHandle) {
      return { content: [{ type: "text", text: `No collection found with handle: ${handle}` }] };
    }

    const col = data.collectionByHandle;
    const products = col.products.edges.map(({ node }) => formatProductSummary(node));

    return {
      content: [{
        type: "text",
        text: `## ${col.title} (${products.length} products)\n\n${products.join("\n\n---\n\n")}`,
      }],
    };
  }
);

// Tool 4: Get all active coupons
server.tool(
  "get_all_coupons",
  "Fetch ALL currently active discount coupons and deals on the Eufy store. Returns discount amounts, applicable products, and expiry dates.",
  {
    sort: z.enum(["percentage", "fixed_amount"]).default("percentage").describe("Sort coupons by percentage or fixed amount"),
  },
  async ({ sort }) => {
    const url = new URL(`${COUPONS_BASE}/by_shop`);
    url.searchParams.set("sort_key", sort);
    url.searchParams.set("shopify_domain", SHOPIFY_DOMAIN);
    url.searchParams.set("include_wsuc", "false");
    url.searchParams.set("sales_channel", "web");

    type CouponItem = {
      sku: string; product_title: string; product_type: string;
      handle: string; variant_price: string; value_type: string;
      value: string; title: string; starts_at: string; ends_at: string; currency: string;
    };
    const raw = await getJson(url.toString()) as { status: number; data: CouponItem[] } | CouponItem[];
    const data: CouponItem[] = Array.isArray(raw) ? raw : (raw as { data: CouponItem[] }).data;

    if (!Array.isArray(data) || data.length === 0) {
      return { content: [{ type: "text", text: "No active coupons found." }] };
    }

    const lines = data.slice(0, 30).map(c => {
      const discount = c.value_type === "percentage"
        ? `${Math.abs(parseFloat(c.value))}% off`
        : `$${Math.abs(parseFloat(c.value)).toFixed(2)} off`;
      const expiry = c.ends_at ? ` (expires ${c.ends_at.split("T")[0]})` : "";
      const origPrice = parseFloat(c.variant_price);
      const finalPrice = c.value_type === "fixed_amount"
        ? origPrice + parseFloat(c.value)  // value is negative
        : origPrice * (1 + parseFloat(c.value) / 100);
      return `• **${c.product_title}** [${c.sku}]\n  ${discount}${expiry} — $${origPrice.toFixed(2)} → $${finalPrice.toFixed(2)}\n  URL: https://www.eufy.com/products/${c.handle}`;
    });

    return {
      content: [{
        type: "text",
        text: `## Active Eufy Coupons (${data.length} total, showing ${lines.length})\n\n${lines.join("\n\n")}`,
      }],
    };
  }
);

// Tool 5: Get coupons for specific products
server.tool(
  "get_product_coupons",
  "Check if specific Eufy products have active discount coupons. Provide SKU codes (e.g. T8L02121, T80301D1). Returns any applicable deals.",
  {
    skus: z.array(z.string()).min(1).max(20).describe("Array of product SKU codes to check for discounts"),
  },
  async ({ skus }) => {
    const url = new URL(`${COUPONS_BASE}/by_skus`);
    skus.forEach(sku => url.searchParams.append("skus[]", sku.toUpperCase()));
    url.searchParams.set("shopify_domain", SHOPIFY_DOMAIN);
    url.searchParams.set("include_wsuc", "false");
    url.searchParams.set("sales_channel", "web");

    type SkuCoupon = { product_title: string; variant_price: string; value_type: string; value: string; title: string; ends_at: string; handle: string; };
    const raw = await getJson(url.toString()) as { status: number; data: Record<string, SkuCoupon[]> } | Record<string, SkuCoupon[]>;
    const data: Record<string, SkuCoupon[]> = (raw as { data?: Record<string, SkuCoupon[]> }).data ?? (raw as Record<string, SkuCoupon[]>);

    const lines: string[] = [];
    for (const [sku, coupons] of Object.entries(data)) {
      if (!coupons?.length) {
        lines.push(`• **${sku}**: No active coupons`);
        continue;
      }
      for (const c of coupons) {
        const discount = c.value_type === "percentage"
          ? `${Math.abs(parseFloat(c.value))}% off`
          : `$${Math.abs(parseFloat(c.value)).toFixed(2)} off`;
        const orig = parseFloat(c.variant_price);
        const final = c.value_type === "fixed_amount"
          ? orig + parseFloat(c.value)
          : orig * (1 + parseFloat(c.value) / 100);
        const expiry = c.ends_at ? ` (expires ${c.ends_at.split("T")[0]})` : "";
        lines.push(`• **${sku}** — ${c.product_title}\n  Coupon: ${c.title}\n  ${discount}${expiry}: $${orig.toFixed(2)} → $${final.toFixed(2)}\n  URL: https://www.eufy.com/products/${c.handle}`);
      }
    }

    return {
      content: [{
        type: "text",
        text: `## Coupon Check for ${skus.join(", ")}\n\n${lines.join("\n\n")}`,
      }],
    };
  }
);

// Tool 6: Get popular/trending products
server.tool(
  "get_popular_products",
  "Get Eufy's current best-selling and trending products with prices.",
  {
    limit: z.number().int().min(1).max(20).default(12).describe("Number of popular products to return"),
  },
  async ({ limit }) => {
    const url = new URL(`${RAINBOW_BASE}/popular`);
    url.searchParams.set("shopify_domain", SHOPIFY_DOMAIN);
    url.searchParams.set("limit", String(limit));

    const res = await getJson(url.toString()) as {
      code: number;
      data: Array<{
        handle: string;
        sku: string;
        product_title: string;
        variant_price: string;
        currency_symbol: string;
        variant_url: string;
      }>
    };

    const items = (res.data || []).map((p, i) =>
      `${i + 1}. **${p.product_title}** [${p.sku}]\n   Price: ${p.currency_symbol}${p.variant_price}\n   URL: ${p.variant_url}`
    );

    return {
      content: [{
        type: "text",
        text: `## Eufy Trending Products\n\n${items.join("\n\n")}`,
      }],
    };
  }
);

// Tool 7: Find best deal for a shopping list
server.tool(
  "find_best_deal",
  "Find the cheapest way to buy a list of Eufy products. Searches for bundles, applies available coupons, and compares individual vs bundle pricing.",
  {
    items: z.array(z.object({
      query: z.string().describe("Product search query (e.g. 'eufyCam S4', 'HomeBase S380', 'Indoor Cam S350')"),
      quantity: z.number().int().min(1).default(1),
    })).min(1).describe("List of items to buy with quantities"),
  },
  async ({ items }) => {
    const results: string[] = [];
    let totalMin = 0;
    let totalMax = 0;
    const skus: string[] = [];

    for (const item of items) {
      // Search for the product
      const data = await shopifyGql(SEARCH_QUERY, {
        query: item.query,
        first: 3,
        sortKey: "RELEVANCE",
        types: ["PRODUCT"],
      }) as { search: { edges: Array<{ node: Record<string, unknown> }> } };

      const hits = data.search.edges;
      if (!hits.length) {
        results.push(`❌ **"${item.query}"** — No products found`);
        continue;
      }

      const best = hits[0].node;
      const priceRange = best.priceRange as PriceRange;
      const minPrice = parseFloat(priceRange.minVariantPrice.amount);
      const lineTotal = minPrice * item.quantity;
      totalMin += lineTotal;
      totalMax += parseFloat(priceRange.maxVariantPrice.amount) * item.quantity;

      // Collect SKUs from variants
      const variants = (best.variants as { edges: Array<{ node: { sku?: string } }> }).edges;
      variants.forEach(({ node: v }) => { if (v.sku) skus.push(v.sku); });

      const compareAt = best.compareAtPriceRange as PriceRange;
      const wasNote = compareAt
        ? (() => {
          const was = parseFloat(compareAt.maxVariantPrice.amount);
          const now = parseFloat(priceRange.maxVariantPrice.amount);
          if (was > now) return ` ~~$${was.toFixed(2)}~~`;
          return "";
        })()
        : "";

      const qty = item.quantity > 1 ? ` × ${item.quantity}` : "";
      results.push(`✓ **${best.title}**${qty}\n  $${minPrice.toFixed(2)}${wasNote} each = $${lineTotal.toFixed(2)}\n  URL: https://www.eufy.com/products/${best.handle}`);
    }

    // Check coupons for all found SKUs
    let couponSummary = "";
    if (skus.length > 0) {
      try {
        const couponUrl = new URL(`${COUPONS_BASE}/by_skus`);
        skus.slice(0, 10).forEach(s => couponUrl.searchParams.append("skus[]", s));
        couponUrl.searchParams.set("shopify_domain", SHOPIFY_DOMAIN);
        couponUrl.searchParams.set("include_wsuc", "false");
        couponUrl.searchParams.set("sales_channel", "web");

        const couponData = await getJson(couponUrl.toString()) as Record<string, Array<{
          value: string; value_type: string; title: string
        }>>;

        const activeCoupons: string[] = [];
        for (const [sku, coupons] of Object.entries(couponData)) {
          if (coupons?.length) {
            const best = coupons[0];
            const disc = best.value_type === "fixed_amount"
              ? `$${Math.abs(parseFloat(best.value)).toFixed(2)} off`
              : `${Math.abs(parseFloat(best.value))}% off`;
            activeCoupons.push(`  • ${sku}: ${disc} ("${best.title}")`);
          }
        }
        if (activeCoupons.length) {
          couponSummary = `\n\n**Available Coupons:**\n${activeCoupons.join("\n")}`;
        }
      } catch {
        // coupon fetch is best-effort
      }
    }

    // Also check for bundle kits
    const bundleSearch = await shopifyGql(SEARCH_QUERY, {
      query: items.map(i => i.query).join(" "),
      first: 3,
      sortKey: "RELEVANCE",
      types: ["PRODUCT"],
    }) as { search: { edges: Array<{ node: Record<string, unknown> }> } };

    const bundleHits = bundleSearch.search.edges
      .filter(({ node }) => {
        const tags = (node.tags as string[]).join(" ").toLowerCase();
        const title = (node.title as string).toLowerCase();
        return tags.includes("kit") || tags.includes("bundle") || title.includes("kit") || title.includes("bundle");
      });

    let bundleNote = "";
    if (bundleHits.length) {
      const bundleLines = bundleHits.map(({ node: b }) => {
        const p = parseFloat((b.priceRange as PriceRange).minVariantPrice.amount);
        return `  • **${b.title}**: $${p.toFixed(2)} — https://www.eufy.com/products/${b.handle}`;
      });
      bundleNote = `\n\n**Possible Bundle Deals:**\n${bundleLines.join("\n")}`;
    }

    return {
      content: [{
        type: "text",
        text: [
          `## Shopping List Price Breakdown`,
          ``,
          results.join("\n\n"),
          ``,
          `---`,
          `**Subtotal (individual prices): $${totalMin.toFixed(2)}${totalMin !== totalMax ? ` – $${totalMax.toFixed(2)}` : ""}**`,
          couponSummary,
          bundleNote,
        ].filter(Boolean).join("\n"),
      }],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
