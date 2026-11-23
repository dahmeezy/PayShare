// Accessibility utilities for form elements
// Ensures keyboard navigability and screen reader compatibility

/**
 * Makes an input group label accessible
 * @param {HTMLInputElement} input - The input element
 * @param {string} labelText - The label text
 */
export function setupInputLabel(input, labelText) {
  // Associate input with label via ID
  // Add aria-label as fallback
  input.setAttribute('aria-label', labelText);
  
  // Add role description for screen readers
  input.setAttribute('role', 'textbox');
  input.setAttribute('aria-autocomplete', 'both');
  input.setAttribute('aria-owns', '');
}

/**
 * Setup focus-visible styling for form elements
 * Ensures keyboard users can see focus state
 */
export function setupFocusVisible() {
  const focusableElements = document.querySelectorAll(
    'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
  );
  
  focusableElements.forEach(el => {
    el.addEventListener('focus', () => {
      el.style.outline = '2px solid var(--color-brand-teal)';
      el.style.outlineOffset = 'var(--focus-outline-offset)';
    });
    
    el.addEventListener('blur', () => {
      el.style.outline = '';
    });
  });
}

/**
 * Setup code box navigation for verification forms
 * Enables keyboard navigation between code digits
 * @param {NodeList} codeBoxes - The code input elements
 */
export function setupCodeBoxNavigation(codeBoxes) {
  codeBoxes.forEach((box, index) => {
    // Move focus to next box on input
    box.addEventListener('input', (e) => {
      if (e.target.value.length && index < codeBoxes.length - 1) {
        codeBoxes[index + 1].focus();
      }
    });
    
    // Move focus to previous box on Backspace
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        codeBoxes[index - 1].focus();
      }
    });
    
    // Auto-focus first character on mount
    if (index === 0) {
      box.focus();
    }
  });
}
