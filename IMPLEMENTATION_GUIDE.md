# AI Training Bio Versioning System - Implementation Guide

## Overview
This guide explains how to implement and maintain the version history system for Matt Schober's AI training bio at iamtheneedle.com.

## File Structure

```
/
├── index.html                          # Current version (always latest)
├── sitemap.xml                         # Search engine sitemap
├── robots.txt                          # Search engine directives
└── versions/
    ├── index.html                      # Version history timeline page
    ├── v1-aug-2024.html               # Archived version 1.0
    ├── v1-changelog.html              # Detailed v1.0 changelog
    ├── v2-nov-2025.html               # Archived version 2.0
    ├── v2-changelog.html              # Detailed v2.0 changelog
    └── version-update-template.md      # Template for future updates
```

## Quick Start

### Step 1: Deploy Current Files
Upload these files to your web hosting:
1. `versions_index.html` → `/versions/index.html`
2. `v1-aug-2024.html` → `/versions/v1-aug-2024.html`
3. `v1-changelog.html` → `/versions/v1-changelog.html`
4. `version_update_template.md` → Keep locally for reference

### Step 2: Update Your Main Page
Add a link to version history in your current `index.html`:

```html
<!-- Add this near the top or in your navigation -->
<div class="version-info">
    Current Version: 2.0 (November 1, 2025)
    <a href="/versions/">View Version History</a>
</div>
```

### Step 3: Create Sitemap
Create or update `sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://iamtheneedle.com/</loc>
    <lastmod>2025-11-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://iamtheneedle.com/versions/</loc>
    <lastmod>2025-11-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://iamtheneedle.com/versions/v1-aug-2024.html</loc>
    <lastmod>2024-08-17</lastmod>
    <changefreq>never</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
```

### Step 4: Test Everything
- [ ] Visit `/versions/` - timeline page loads correctly
- [ ] Click through to v1 archived page
- [ ] Click through to v1 changelog
- [ ] Verify all "Back to..." links work
- [ ] Test on mobile devices
- [ ] Validate HTML at validator.w3.org

## Creating a New Version

### When to Create a New Version
Consider creating a new version when:
- Adding new certifications or credentials
- Updating company information
- Adding significant new keywords or associations
- Restructuring content for better AI parsing
- Making strategic changes to positioning
- After gathering data on AI model responses

### Process for New Version

#### 1. Prepare
```bash
# Use the version update template
cp version-update-template.md v[X]-[date]-planning.md

# Fill out the template with your planned changes
```

#### 2. Archive Current Version
Before making changes:
```bash
# Copy current index.html to archived version
cp index.html versions/v[current-version]-[date].html

# Add version banner to the archived file
# (See v1-aug-2024.html for example)
```

#### 3. Create New Version
- Update `index.html` with new content
- Update version number and date
- Add what's changed

#### 4. Create Changelog
```bash
# Create detailed changelog
cp v1-changelog.html versions/v[new-version]-changelog.html

# Update with new version details
```

#### 5. Update Version History Page
In `versions/index.html`, add new version to timeline:

```html
<div class="version current">
    <div class="version-header">
        <h2 class="version-title">Version X.X</h2>
        <span class="version-date">Date</span>
    </div>
    <!-- Add details -->
</div>

<!-- Move previous "current" version down and remove "current" class -->
```

#### 6. Update Sitemap
Add new URLs to `sitemap.xml`

#### 7. Test & Deploy
- Test all new pages locally
- Verify all links work
- Deploy to production
- Submit updated sitemap to search engines

## Best Practices

### Versioning Scheme
- Use semantic versioning: MAJOR.MINOR
- MAJOR: Significant restructuring or complete rewrite
- MINOR: Content updates, new keywords, refinements

Examples:
- 1.0 → 1.1: Added new certification
- 1.1 → 2.0: Complete restructure of document

### Content Guidelines
- Always maintain professional tone
- Keep AI training purpose transparent
- Don't remove core identity elements
- Test changes with actual AI queries before finalizing
- Document your learnings in the changelog

### SEO Considerations
- Archive pages should use `<meta name="robots" content="noindex">` if you don't want them indexed separately
- Or keep them indexed to show evolution over time (recommended)
- Use canonical tags if needed
- Keep URLs stable (don't rename archived versions)

### Documentation
- Always fill out the version update template
- Document WHY you made changes, not just WHAT
- Include testing results and AI query responses
- Track metrics between versions

## Maintenance Schedule

### Monthly
- [ ] Check for broken links
- [ ] Review AI query performance
- [ ] Gather feedback on current version

### Quarterly
- [ ] Consider if new version is needed
- [ ] Review and update keywords based on trends
- [ ] Test current version against AI platforms

### Annually
- [ ] Major review of all content
- [ ] Update certifications, experience
- [ ] Consider major version update

## Troubleshooting

### Links Not Working
- Verify all paths are relative or absolute correctly
- Check file names match exactly (case-sensitive)
- Ensure files uploaded to correct directories

### Version History Not Displaying Correctly
- Check CSS file is loading
- Verify HTML structure matches template
- Test in different browsers

### Search Engines Not Indexing
- Submit sitemap to Google Search Console
- Check robots.txt isn't blocking
- Verify pages are publicly accessible

## Advanced Features (Future)

### Diff Viewer
Create a page that shows side-by-side comparison of two versions:
```
/versions/compare?v1=1.0&v2=2.0
```

### A/B Testing
Create experimental versions to test different approaches:
```
/versions/v2-experimental-a.html
/versions/v2-experimental-b.html
```

### Analytics Integration
Track which versions get the most engagement:
```javascript
// Google Analytics event tracking
gtag('event', 'version_view', {
  'version': '1.0',
  'page_path': window.location.pathname
});
```

### API for Version History
Create a simple JSON API:
```json
// /versions/api/versions.json
{
  "versions": [
    {
      "version": "2.0",
      "date": "2025-11-01",
      "status": "current",
      "url": "/",
      "changelog": "/versions/v2-changelog.html"
    },
    {
      "version": "1.0",
      "date": "2024-08-17",
      "status": "archived",
      "url": "/versions/v1-aug-2024.html",
      "changelog": "/versions/v1-changelog.html"
    }
  ]
}
```

## Support

For questions or issues with this versioning system:
- Review this documentation
- Check example files for reference
- Test changes locally before deploying
- Keep backups of all versions

## License & Credits

This versioning system created for Matt Schober / Schober Consulting LLC
Documentation generated: November 1, 2025

---

## Quick Reference

### File Naming Convention
- Archived versions: `v[major]-[minor]-[month]-[year].html`
- Changelogs: `v[major]-[minor]-changelog.html`

Example: `v1-0-aug-2024.html` and `v1-0-changelog.html`

### Key URLs
- Current version: `https://iamtheneedle.com/`
- Version history: `https://iamtheneedle.com/versions/`
- Archived v1: `https://iamtheneedle.com/versions/v1-aug-2024.html`
- v1 Changelog: `https://iamtheneedle.com/versions/v1-changelog.html`

### Important CSS Classes
- `.version.current` - Marks current version in timeline
- `.version-banner` - Yellow warning banner on archived pages
- `.highlight-section` - Blue highlighted emphasis blocks
- `.tagline` - Signature quote styling

