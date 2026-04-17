/**
 * Protection Module - Prevents copying, screenshotting (partial), and developer tools
 */
const Protection = (() => {
    function init() {
        disableRightClick();
        disableShortcuts();
        handleTabVisibility();
        preventDragDrop();
        console.log("Protection System Active.");
    }

    function disableRightClick() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }

    function disableShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Disable F12
            if (e.keyCode === 123) {
                e.preventDefault();
                return false;
            }

            // Disable Ctrl+Shift+I (Inspect)
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
                e.preventDefault();
                return false;
            }

            // Disable Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
                e.preventDefault();
                return false;
            }

            // Disable Ctrl+U (Source)
            if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
                e.preventDefault();
                return false;
            }

            // Disable Ctrl+S (Save)
            if (e.ctrlKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
                e.preventDefault();
                return false;
            }

            // Disable Ctrl+C (Copy)
            if (e.ctrlKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
                // Allow in inputs only
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    return false;
                }
            }
            
            // Disable Ctrl+P (Print)
            if (e.ctrlKey && (e.key === 'P' || e.key === 'p' || e.keyCode === 80)) {
                e.preventDefault();
                return false;
            }
        });
    }

    function handleTabVisibility() {
        // Blur app when user switches tabs or minimizes window to hinder screen recording/screenshots
        window.addEventListener('blur', () => {
            document.body.classList.add('tab-blur');
        });

        window.addEventListener('focus', () => {
            document.body.classList.remove('tab-blur');
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                document.body.classList.add('tab-blur');
            } else {
                document.body.classList.remove('tab-blur');
            }
        });
    }

    function preventDragDrop() {
        // Prevent dragging images or text
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
    }

    return { init };
})();

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    Protection.init();
});
