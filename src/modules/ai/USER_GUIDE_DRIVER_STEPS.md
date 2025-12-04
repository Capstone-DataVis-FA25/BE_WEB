# DataVis Web User Guide

This guide describes how users interact with DataVis web application. Focus on visible UI elements and user workflows.

**IMPORTANT FOR AI RESPONSES:**
- Only mention UI elements users can SEE (button labels, menu names, section titles)
- Describe locations naturally ("upper right corner", "sidebar", "top of page")
- NEVER mention technical selectors (#btn-new-chart, .class-name, etc.)
- Use simple, natural language that any user can understand

**NAVIGATION:**
- DataVis does NOT have a "Dashboard" page
- Main pages: Home → Charts → Chart Gallery → Chart Editor
- To create a chart: Charts page → Click "New Chart" button → Gallery → Editor

---

## Home Page Tour (`home-steps`)

1. Welcome

- Title: Icons.Rocket Welcome to DataVis
- Description: Create beautiful, responsive charts with no coding required. Let's explore what makes DataVis special.
- Align: center

1. Hero CTA: Build Chart

- Element: #hero-cta-build-chart
- Title: Icons.BarChart3 Build Your First Chart
- Description: Start here! Create custom charts from your data with our intuitive editor.
- Side: bottom
- Align: start

1. Chart Types Section

- Element: #chart-types-section
- Title: Icons.LayoutDashboard Explore Templates
- Description: Discover our collection of professional chart templates. Click to preview and learn more.
- Side: top
- Align: center

1. Features Section

- Element: #features-section
- Title: Icons.Sparkles Powerful Features
- Description: Everything you need: customization, collaboration, and export options in one platform.
- Side: top
- Align: center

---

## Dataset Management

### Dataset List Page
- **URL:** `/workspace/datasets`
- **"New Dataset" button**: Green button in the top right to create new datasets
- **Search bar**: Find datasets by name or description
- **Dataset cards**: Show dataset name, description, row/column count, creation date

### Creating a Dataset
1. Click **"New Dataset"** button
2. Choose upload method from the sidebar:
   - **"Upload your data"**: Upload CSV, Excel files
   - **"Paste your data"**: Paste CSV text directly
   - **"Try sample data"**: Use pre-loaded examples
   - **"Clean with AI"**: Let AI clean messy data automatically

3. Preview and validate your data
4. Enter dataset name and description
5. Click **"Create Dataset"** to save

### AI Data Cleaning Feature
- Upload messy CSV or Excel files
- AI automatically:
  - Removes duplicates
  - Fixes formatting
  - Standardizes number formats
  - Cleans text fields
- Shows progress bar while processing
- Get notification when cleaning is complete

---

## Charts Page Tour

### Navigation
- **URL:** `/workspace/charts` or `/charts`
- **Access:** From main navigation menu or Home page

### Creating a New Chart (User Flow)
1. Navigate to the **Charts** page
2. Click the **"New Chart"** button (located in the upper right corner)
3. You'll be redirected to the **Chart Gallery** to select a template
4. Choose your dataset (or use sample data)
5. Select a chart template and click **"Continue"**
6. Customize your chart in the **Chart Editor**

### Key UI Elements
- **"New Chart" button**: Blue button in the top right corner to create new charts
- **Search bar**: Find existing charts by name or description
- **Chart cards**: Display your saved charts with preview, name, type, and date
- **Filter options**: Sort and filter your chart list

---

## Chart Gallery Page

### Purpose
The Gallery is where you choose a chart template when creating a new chart.

### User Workflow
1. After clicking "New Chart", you arrive at the Gallery
2. **(Optional)** Select a dataset from the **"Dataset"** dropdown at the top
   - You can skip this to use sample data
3. Filter templates using the **"Category"** dropdown
4. Browse the template grid and click **"Continue"** on your chosen template
5. You'll be taken to the Chart Editor to customize

### Key UI Elements
- **Dataset selector**: Dropdown at the top to choose which dataset to use
- **Category filter**: Dropdown to filter templates by type (Comparison, Trend, Distribution, etc.)
- **Template cards**: Visual previews showing chart name, type, and sample image
- **"Continue" button**: On each template card to proceed to editing

---

## Chart Editor Page

### Purpose
The Editor is where you customize your chart after selecting a template.

### Key Sections (What Users See)
1. **Chart Type Selector** (left sidebar)
   - Switch between chart types: Bar, Line, Pie, Area, Scatter, Heatmap, etc.
   - Located at the top of the left sidebar

2. **Series Management** (left sidebar)
   - Add or remove data series
   - Configure which data columns to display
   - Customize series names and colors

3. **Chart Settings** (left sidebar)
   - Basic Settings: Title, dimensions, margins
   - Axes: Configure X and Y axis labels, scales
   - Legend: Position, style, visibility
   - Colors & Theme: Color schemes, background
   - Animations: Enable/disable and set duration
   - Interactivity: Zoom, pan, tooltips

4. **Save/Export** (top right)
   - **"Save Chart"** button: Save to your workspace
   - Export options: PNG, SVG, JSON

### User Workflow
1. Arrive from Gallery with selected template
2. Adjust chart type if needed
3. Configure data series (which columns to show)
4. Customize appearance using settings panels
5. Preview changes in real-time on the right
6. Save or export when satisfied

---

## Pricing Page Tour (`pricing-steps`)

1. Pricing Plans

- Title: Icons.CreditCard Pricing Plans
- Description: Choose the perfect plan for your needs. Upgrade anytime as you grow.
- Align: center

1. Plans Grid

- Element: #pricing-plans-grid
- Title: Icons.LayoutDashboard Compare Options
- Description: Browse our tiers. From free starter plans to enterprise solutions, we have you covered.
- Side: top
- Align: center

1. Features List

- Element: .pricing-plan-features:first-child
- Title: Icons.Sparkles What's Included
- Description: Check the features list to see exactly what you get with each plan.
- Side: left
- Align: start

1. Subscribe Button

- Element: .pricing-subscribe-button:first-child
- Title: Icons.Rocket Get Started
- Description: Ready to upgrade? Click to subscribe and unlock premium features instantly.
- Side: top
- Align: center

---

## Element Selector Reference

- Home:
  - #hero-cta-build-chart → src/pages/home/HomePage.tsx:410
  - #chart-types-section → src/pages/home/HomePage.tsx:449
  - #features-section → src/pages/home/HomePage.tsx:575
- Datasets:
  - #btn-new-dataset → src/pages/dataset/DatasetListPage.tsx:310
  - #search-dataset → src/pages/dataset/DatasetListPage.tsx:337 (also src/pages/chart/DatasetListPage.tsx:309)
  - #dataset-card-0 → Not found in codebase (likely dynamic; generated per card)
  - #upload-method-nav → src/components/dataset/UploadMethodNavigation.tsx:44
  - #nav-btn-cleanDataset → Not found in codebase (check Create Dataset UI for actual button id/class)
- Charts:
  - #btn-new-chart → Not found in codebase (check ChartListPage for new chart trigger)
  - #search-chart → src/pages/chart/ChartListPage.tsx:434
  - #chart-card-0 → Not found in codebase (likely dynamic; generated per card)
- Gallery:
  - #dataset-section → src/pages/chart-gallery/ChooseTemplateTab.tsx:336
  - #category-filter → src/pages/chart-gallery/ChooseTemplateTab.tsx:407
  - #templates-grid → src/pages/chart-gallery/ChooseTemplateTab.tsx:673
- Editor:
  - #chart-type-selector → src/components/charts/UnifiedChartEditor.tsx:59
  - #series-management-section → src/components/charts/UnifiedChartEditor.tsx:87
  - #chart-settings-section → src/components/charts/UnifiedChartEditor.tsx:77
  - #save-chart-button → Not found in codebase (check editor actions/footer for save button)
- Pricing:
  - #pricing-plans-grid → src/pages/subscription/PricingPage.tsx:149
  - .pricing-plan-features:first-child → Not found in codebase (likely class not present or generated)
  - .pricing-subscribe-button:first-child → Not found in codebase (likely class not present or generated)

---

## Visible Text Labels for Selectors

- Home
  - #hero-cta-build-chart: Button text "Build Your Own Chart"
  - #chart-types-section: Heading t('home_chartTypes_title'), description t('home_chartTypes_desc')
  - #features-section: Section content with feature highlights (dynamic)
- Datasets
  - #btn-new-dataset: Button text "New Dataset"
  - #search-dataset: Input placeholder "Search datasets by name or description..."
  - #dataset-card-0: First dataset card (dynamic title/description)
  - #upload-method-nav → Panel title "Upload Method"; items:
    - #nav-btn-upload: "Upload your data"
    - #nav-btn-textUpload: "Paste your data"
    - #nav-btn-sampleData: "Try sample data"
    - #nav-btn-cleanDataset: "Clean with AI"
- Charts
  - #btn-new-chart: New chart trigger (label not found; likely "New Chart" or similar)
  - #search-chart: Input placeholder "Search charts by name or description..."
  - #chart-card-0: First chart card (dynamic title/type/date)
- Gallery
  - #dataset-section: Label "Dataset" with button text "Select"/"Change" and dataset name
  - #category-filter: Label t('chart_gallery_category'); select placeholder t('chart_gallery_select_category')
  - #templates-grid: Grid of template cards with names, type, category; action button "Continue"
- Editor
  - #chart-type-selector: Chart type picker component (no direct text)
  - #series-management-section: Series management section (component labels inside)
  - #chart-settings-section: Basic chart settings section
  - #save-chart-button: Save action (label not found; likely "Save" or "Save Chart")
- Pricing
  - #pricing-plans-grid: Cards showing plan.name, plan.description, price and feature list
  - .pricing-plan-features: List items are features from plan.features
  - .pricing-subscribe-button: Subscribe CTA on each plan (label not found; likely "Subscribe" or "Get Started")

---

## Notes for Training

- Each selector above includes its current file and line for easier DOM anchoring in training data.
- "Not found" entries indicate selectors/classes not present in the repository snapshot; they may be dynamic or outdated. Verify and update the selector to the actual element.
- Lines may shift; re-run a grep before training to refresh positions.
