import sys

with open('style.css', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

# Keep only the valid lines (up to line 553)
valid_lines = lines[:553]

# The correct CSS block to append
auth_css = """
/* =========================================================================
   AUTH PAGE (LOGIN)
   ========================================================================= */
.auth-page {
    background-color: var(--bg-main);
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    padding: 20px;
    background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
    background-size: 20px 20px;
}

.auth-container {
    width: 100%;
    max-width: 400px;
}

.auth-card {
    background-color: var(--bg-surface);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 10px 30px rgba(9, 30, 66, 0.1);
    padding: 40px;
}

.auth-header {
    text-align: center;
    margin-bottom: 32px;
}

.auth-header .logo {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
    font-size: 1.5rem;
}

.auth-header h1 {
    font-size: 1.25rem;
    color: var(--text-primary);
}

.auth-form-group {
    margin-bottom: 16px;
}

.auth-form-group input {
    width: 100%;
}

.full-width {
    width: 100%;
    justify-content: center;
    padding: 10px;
    font-size: 1rem;
    margin-top: 8px;
}

.auth-link {
    color: var(--primary-blue);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
    transition: var(--transition-fast);
}

.auth-link:hover {
    color: var(--primary-blue-hover);
    text-decoration: underline;
}

.auth-footer {
    text-align: center;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid var(--border-color);
    font-size: 0.85rem;
    color: var(--text-secondary);
}

.btn-group {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}
"""

with open('style.css', 'w', encoding='utf-8') as f:
    f.writelines(valid_lines)
    if not valid_lines[-1].endswith('\n'):
        f.write('\n')
    f.write(auth_css)

print("CSS Fixed!")
