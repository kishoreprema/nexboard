document.addEventListener('DOMContentLoaded', () => {
    // Inject HTML
    const modalHTML = `
    <div class="modal-overlay hidden profile-modal" id="profile-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Profile Settings</h2>
                <button class="close-btn" id="close-profile-modal" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-secondary);"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <form id="profile-form">
                <div class="modal-body">
                    <div class="avatar-preview" id="profile-avatar-preview"></div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="profile-avatar-file" style="display:block; margin-bottom:8px; font-weight:500; font-size:0.9rem;">Upload Avatar Image (Max 2MB)</label>
                        <input type="file" id="profile-avatar-file" accept="image/*" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--border-radius-sm);">
                        <button type="button" id="remove-avatar-btn" style="margin-top: 8px; padding: 4px 8px; font-size: 0.8rem; background: transparent; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; color: var(--text-secondary);">Remove Avatar</button>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="profile-current-password" style="display:block; margin-bottom:8px; font-weight:500; font-size:0.9rem;">Current Password (required to change password)</label>
                        <input type="password" id="profile-current-password" placeholder="Enter current password" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--border-radius-sm);">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="profile-new-password" style="display:block; margin-bottom:8px; font-weight:500; font-size:0.9rem;">New Password</label>
                        <input type="password" id="profile-new-password" placeholder="Enter new password" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--border-radius-sm);">
                    </div>
                    <div id="profile-error-msg" style="color: var(--accent-red); font-size: 0.9rem; margin-top: 8px;"></div>
                </div>
                <div class="modal-footer" style="padding-top:16px; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:12px;">
                    <button type="button" class="secondary-btn" id="cancel-profile" style="padding:8px 16px; border:1px solid var(--border-color); border-radius:var(--border-radius-sm); background:transparent; cursor:pointer;">Cancel</button>
                    <button type="submit" class="primary-btn" style="padding:8px 16px; border:none; border-radius:var(--border-radius-sm); background:var(--primary-blue); color:white; cursor:pointer;">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const currentUserStr = localStorage.getItem('nexboard_currentUser');
    if (!currentUserStr) return;
    let user = JSON.parse(currentUserStr);

    const modal = document.getElementById('profile-modal');
    const closeBtn = document.getElementById('close-profile-modal');
    const cancelBtn = document.getElementById('cancel-profile');
    const form = document.getElementById('profile-form');
    const fileInput = document.getElementById('profile-avatar-file');
    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    let currentAvatarBase64 = user.avatarUrl || null;
    const currentPwdInput = document.getElementById('profile-current-password');
    const newPwdInput = document.getElementById('profile-new-password');
    const preview = document.getElementById('profile-avatar-preview');
    const errorMsg = document.getElementById('profile-error-msg');

    // Bind to the existing avatar button
    const avatarBtns = document.querySelectorAll('.avatar-btn'); // Handles multiple if present

    function updateAvatarsGlobally(userData) {
        document.querySelectorAll('.avatar-btn').forEach(btn => {
            const hasDot = btn.querySelector('#user-status-dot');
            const dotHTML = hasDot ? hasDot.outerHTML : '';

            if (userData.avatarUrl) {
                btn.style.backgroundImage = `url(${userData.avatarUrl})`;
                btn.style.backgroundSize = 'cover';
                btn.style.backgroundPosition = 'center';
                btn.innerHTML = dotHTML; // Remove initials, keep dot
                btn.style.color = 'transparent';
                btn.style.border = 'none';
            } else {
                btn.style.backgroundImage = 'none';
                btn.innerHTML = dotHTML + userData.initials;
                btn.style.color = 'white';
                btn.style.backgroundColor = userData.color || 'var(--primary-blue)';
            }
        });

        if (userData.avatarUrl) {
            preview.style.backgroundImage = `url(${userData.avatarUrl})`;
            preview.innerText = '';
            preview.style.backgroundColor = 'transparent';
            preview.style.border = 'none';
        } else {
            preview.style.backgroundImage = 'none';
            preview.innerText = userData.initials;
            preview.style.backgroundColor = userData.color || 'var(--primary-blue)';
        }
    }

    // Initialize avatars on load
    updateAvatarsGlobally(user);

    function openModal() {
        errorMsg.innerText = '';
        fileInput.value = '';
        currentAvatarBase64 = user.avatarUrl || null;
        currentPwdInput.value = '';
        newPwdInput.value = '';
        updateAvatarsGlobally(user);
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    avatarBtns.forEach(btn => btn.addEventListener('click', openModal));
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                errorMsg.innerText = "File size must be under 2MB.";
                fileInput.value = '';
                return;
            }
            errorMsg.innerText = '';
            const reader = new FileReader();
            reader.onload = (event) => {
                currentAvatarBase64 = event.target.result;
                preview.style.backgroundImage = `url(${currentAvatarBase64})`;
                preview.innerText = '';
                preview.style.backgroundColor = 'transparent';
                preview.style.border = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    removeAvatarBtn.addEventListener('click', () => {
        currentAvatarBase64 = null;
        fileInput.value = '';
        preview.style.backgroundImage = 'none';
        preview.innerText = user.initials;
        preview.style.backgroundColor = user.color || 'var(--primary-blue)';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.innerText = '';

        const payload = {};
        payload.avatarUrl = currentAvatarBase64;

        if (currentPwdInput.value || newPwdInput.value) {
            if (!currentPwdInput.value || !newPwdInput.value) {
                errorMsg.innerText = "Both current and new password are required to change password.";
                return;
            }
            payload.currentPassword = currentPwdInput.value;
            payload.newPassword = newPwdInput.value;
        }

        try {
            const res = await fetch(`http://localhost:3000/api/users/${user.id}/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                errorMsg.innerText = data.error || 'Failed to update profile';
                return;
            }

            // Success
            localStorage.setItem('nexboard_currentUser', JSON.stringify(data));
            user = data; // Update local reference
            updateAvatarsGlobally(data);
            closeModal();
            // Show brief animation or alert
            const originalText = document.querySelector('.auth-dropdown button').innerText;
            // Provide a visual cue
        } catch (err) {
            errorMsg.innerText = "Network error occurred.";
        }
    });
});
