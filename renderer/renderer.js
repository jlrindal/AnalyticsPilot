// Renderer.js - Legacy support file
// The main application logic has been moved to index.html inline script
// This file is kept for backwards compatibility and any additional utilities

// Utility functions that might be useful for the application
const Utils = {
  // Format numbers for display
  formatNumber: (num) => {
    return new Intl.NumberFormat().format(num);
  },
  
  // Format dates for display
  formatDate: (date) => {
    return new Intl.DateTimeFormat().format(new Date(date));
  },
  
  // Escape HTML for safe display
  escapeHtml: (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  // Show toast notifications
  showToast: (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#f44336' : '#4CAF50'};
      color: white;
      border-radius: 4px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Export utilities globally
window.Utils = Utils; 
