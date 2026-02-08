// YourGP Care Plan Generator - Frontend Application

// Configuration
const CONFIG = {
    SUPABASE_URL: 'https://pqaeswutidxsylbckytw.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxYWVzd3V0aWR4c3lsYmNreXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NDk3MTcsImV4cCI6MjA4NjEyNTcxN30.6MmBtW-rVH-y9Si0yAPO31MM-FrMaG_p1Os3ddB-zNQ'
};

// Condition display names
const conditionNames = {
    diabetes: 'Type 2 Diabetes',
    copd: 'COPD',
    cvd: 'Cardiovascular Disease',
    mentalHealth: 'Mental Health',
    ckd: 'Chronic Kidney Disease',
    osteoarthritis: 'Osteoarthritis'
};

// Generate care plan
async function generateCarePlan() {
    const healthSummary = document.getElementById('healthSummary').value.trim();

    if (!healthSummary) {
        showError('Please enter a health summary before generating.');
        return;
    }

    // Check configuration
    if (CONFIG.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
        showError('Please configure your Supabase URL and anon key in app.js');
        return;
    }

    // UI: Show loading state
    const generateBtn = document.getElementById('generateBtn');
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoading = generateBtn.querySelector('.btn-loading');

    generateBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    hideError();
    hideOutput();

    try {
        const response = await fetch(
            `${CONFIG.SUPABASE_URL}/functions/v1/generate-care-plan`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ healthSummary })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        // Display the care plan
        showOutput(data.carePlan, data.detectedConditions);

    } catch (error) {
        console.error('Error generating care plan:', error);
        showError(`Failed to generate care plan: ${error.message}`);
    } finally {
        // Reset button state
        generateBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// Show the generated care plan
function showOutput(carePlan, detectedConditions) {
    const outputSection = document.getElementById('outputSection');
    const carePlanOutput = document.getElementById('carePlanOutput');
    const conditionsDiv = document.getElementById('detectedConditions');

    // Display detected conditions as tags
    conditionsDiv.innerHTML = '';
    if (detectedConditions && detectedConditions.length > 0) {
        detectedConditions.forEach(condition => {
            const tag = document.createElement('span');
            tag.className = 'condition-tag';
            tag.textContent = conditionNames[condition] || condition;
            conditionsDiv.appendChild(tag);
        });
    }

    // Display the care plan
    carePlanOutput.textContent = carePlan;
    outputSection.style.display = 'block';

    // Scroll to output
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Hide output section
function hideOutput() {
    document.getElementById('outputSection').style.display = 'none';
}

// Copy care plan to clipboard
async function copyToClipboard() {
    const carePlan = document.getElementById('carePlanOutput').textContent;
    const feedback = document.getElementById('copyFeedback');

    try {
        await navigator.clipboard.writeText(carePlan);
        feedback.textContent = 'Copied to clipboard!';
        setTimeout(() => {
            feedback.textContent = '';
        }, 3000);
    } catch (error) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = carePlan;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            feedback.textContent = 'Copied to clipboard!';
            setTimeout(() => {
                feedback.textContent = '';
            }, 3000);
        } catch (e) {
            feedback.textContent = 'Failed to copy. Please select and copy manually.';
            feedback.style.color = '#d63031';
        }
        document.body.removeChild(textarea);
    }
}

// Show error message
function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');

    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Hide error message
function hideError() {
    document.getElementById('errorSection').style.display = 'none';
}

// Keyboard shortcut: Ctrl+Enter to generate
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const healthSummary = document.getElementById('healthSummary');
        if (document.activeElement === healthSummary) {
            generateCarePlan();
        }
    }
});
