# YourGP Care Plan Generator

A Medicare-compliant GPCCMP (GP Chronic Condition Management Plan) generation tool for YourGP practices.

## Overview

This tool helps nurses generate Medicare Item 965 compliant care plans by:
1. Accepting de-identified patient health summaries
2. Automatically detecting relevant chronic conditions
3. Generating structured care plans using Claude AI
4. Following RACGP clinical guidelines for each condition

## Supported Conditions

- Type 2 Diabetes (RACGP 2024 Guidelines)
- COPD (COPD-X Plan 2025)
- Cardiovascular Disease (Heart Foundation 2023)
- Mental Health (RACGP GPMHSC)
- Chronic Kidney Disease (Kidney Health Australia 2020)
- Osteoarthritis (RACGP 2018)

Plus RACGP Red Book (10th Edition, 2024) preventive activities.

## Setup Instructions

### 1. Supabase Edge Function Setup

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link to your project:
   ```bash
   cd yourgp-care-plan-tool
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Set the Anthropic API key as a secret:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=your_api_key_here
   ```

5. Deploy the Edge Function:
   ```bash
   supabase functions deploy generate-care-plan
   ```

### 2. Frontend Configuration

1. Open `app.js`

2. Update the CONFIG object with your Supabase details:
   ```javascript
   const CONFIG = {
       SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
       SUPABASE_ANON_KEY: 'your_anon_key_here'
   };
   ```

   Find these values in your Supabase dashboard under Settings > API.

### 3. GitHub Pages Deployment

1. Create a new GitHub repository

2. Push the frontend files:
   ```bash
   git init
   git add index.html styles.css app.js
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourgp/care-plan-tool.git
   git push -u origin main
   ```

3. Enable GitHub Pages:
   - Go to repository Settings > Pages
   - Source: Deploy from a branch
   - Branch: main, / (root)
   - Save

4. Access your tool at: `https://yourgp.github.io/care-plan-tool/`

## Usage

1. **Prepare health summary**: Generate a health summary in Best Practice and de-identify it (remove name, DOB, Medicare number, address)

2. **Paste into tool**: Copy the de-identified summary and paste into the text area

3. **Generate**: Click "Generate Care Plan" and wait for processing

4. **Review**: Check the generated care plan for accuracy

5. **Copy**: Click "Copy to Clipboard" to copy the plan

6. **Paste to BP**: Paste the care plan into Best Practice as a text file

## Medicare Item 965 Compliance

The generated care plans include all required elements:
- Assessment of health needs and conditions
- Health and lifestyle goals (developed with patient)
- Patient actions
- Treatment and services with referrals
- Review date (3 months)
- Consent documentation
- Copy offered to patient

## Important Notes

- All care plans must be reviewed and approved by the treating GP
- The tool uses de-identified data only - never paste identifiable patient information
- Generated plans are a starting point and may need clinical modification
- Nurses should verify all referrals are appropriate and accessible

## Files

```
yourgp-care-plan-tool/
├── index.html              # Main web interface
├── styles.css              # Styling
├── app.js                  # Frontend JavaScript
├── README.md               # This file
├── prompts/                # Prompt templates (reference)
│   ├── system-base.md      # Medicare 965 requirements
│   ├── diabetes.md         # Diabetes guidelines
│   ├── copd.md             # COPD guidelines
│   ├── cvd.md              # CVD guidelines
│   ├── mental-health.md    # Mental health guidelines
│   ├── ckd.md              # CKD guidelines
│   ├── osteoarthritis.md   # OA guidelines
│   └── preventive.md       # Red Book preventive items
└── supabase/
    └── functions/
        └── generate-care-plan/
            └── index.ts    # Supabase Edge Function
```

## Troubleshooting

### "Please configure your Supabase URL..."
Update the CONFIG object in `app.js` with your actual Supabase project details.

### "Failed to generate care plan: ..."
- Check your Supabase Edge Function is deployed
- Verify the ANTHROPIC_API_KEY secret is set
- Check the Edge Function logs in Supabase dashboard

### Care plan quality issues
- Ensure the health summary contains relevant clinical information
- Include current medications, recent results, and relevant history
- The more detailed the input, the better the output

## Version History

- v1.0 (2026-02-08): Initial release with 6 condition templates
