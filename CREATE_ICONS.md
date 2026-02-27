# Creating Icons for Teams Bot

Your Teams bot needs two icons:

## Required Icons

1. **color.png** - 192x192 pixels - Full color app icon
2. **outline.png** - 32x32 pixels - Transparent outline icon

## Quick Option: Use Placeholder Script

Run this to create simple placeholder icons:

```bash
node scripts/create-icons.js
```

This creates basic colored squares with "C" letter that work for development.

## Professional Option: Create Custom Icons

### Tools
- Figma (free): https://figma.com
- Canva (free): https://canva.com
- Adobe Express (free): https://adobe.com/express

### Design Guidelines

**Color Icon (192x192):**
- Background: Solid color (e.g., #6366F1 indigo)
- Icon: White letter "C" or robot symbol
- Export as PNG, 192x192 pixels
- Name: `color.png`
- Place in: `appPackage/`

**Outline Icon (32x32):**
- Background: Transparent
- Icon: Simple outline in black/dark gray
- Export as PNG, 32x32 pixels
- Name: `outline.png`
- Place in: `appPackage/`

### Example Designs

**Simple Letter:**
```
Color icon: Purple square with white "C"
Outline: Transparent with black "C" outline
```

**Robot:**
```
Color icon: Blue square with white robot head
Outline: Transparent with robot outline
```

## Teams Design Guidelines

Follow Microsoft Teams design system:
- https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/apps-package

Key rules:
- Color icon must be 192x192 exactly
- Outline icon must be 32x32 exactly
- PNG format only
- Max file size: 1.5 MB each
- Outline icon should be monochrome

## Download Free Icons

Sites with free icons:
- https://www.flaticon.com/ (search "code" or "bot")
- https://icons8.com/
- https://www.iconfinder.com/

Remember to:
1. Check license for commercial use
2. Resize to correct dimensions
3. Save as PNG

## For Development

The placeholder icons will work fine for local testing. You can create professional icons later before publishing to Teams App Store.
