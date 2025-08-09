const Profile = {
    styles: {
        primary500: '#00BEFC',
        primary600: '#00A9E0',
        neutral50: '#F9FAFB',
        neutral100: '#F3F4F6',
        neutral200: '#E5E7EB',
        neutral300: '#D1D5DB',
        neutral700: '#374151',
        neutral800: '#1F2937',
        neutral900: '#111827',
        success500: '#10B981',
        danger500: '#EF4444',
        shadowMd: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    },

    render: async () => {
        const s = Profile.styles;
        const currentUrl = window.location.origin + window.location.pathname;

        return `
            <div id="profile-container" style="display: block; padding: 1rem; background-color: ${s.neutral50}; min-height: 100vh;">
                <style>
                    .profile-card {
                        background-color: white;
                        border-radius: 0.75rem;
                        box-shadow: ${s.shadowMd};
                        padding: 1.5rem;
                        margin-bottom: 1.5rem;
                    }
                    .profile-section-title {
                        display: none;
                    }
                    .profile-list-item {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        padding: 0.75rem 0;
                        border-bottom: 1px solid ${s.neutral200};
                        cursor: pointer;
                        -webkit-transition: background-color 0.2s ease;
                        -o-transition: background-color 0.2s ease;
                        transition: background-color 0.2s ease;
                    }
                    .profile-list-item:hover {
                        background-color: ${s.neutral50};
                    }
                    .profile-list-item:last-child {
                        border-bottom: none;
                    }
                    .profile-list-item i {
                        width: 24px;
                        text-align: center;
                        color: ${s.primary500};
                    }
                    .profile-list-item span {
                        font-weight: 500;
                        color: ${s.neutral800};
                    }
                    .btn-primary-referral {
                        background-color: ${s.primary500};
                        color: white;
                        padding: 0.75rem 1.5rem;
                        border-radius: 9999px;
                        font-weight: 600;
                        border: none;
                        -webkit-transition: background-color 0.3s ease;
                        -o-transition: background-color 0.3s ease;
                        transition: background-color 0.3s ease;
                        cursor: pointer;
                    }
                    .btn-primary-referral:hover {
                        background-color: ${s.primary600};
                    }
                    .input-field {
                        width: 100%;
                        padding: 0.75rem 1rem;
                        border: 1px solid ${s.neutral300};
                        border-radius: 9999px;
                        font-size: 1rem;
                        color: ${s.neutral800};
                        background-color: white;
                        box-sizing: border-box;
                        -webkit-transition: border-color 0.3s ease, box-shadow 0.3s ease;
                        -o-transition: border-color 0.3s ease, box-shadow 0.3s ease;
                        transition: border-color 0.3s ease, box-shadow 0.3s ease;
                    }
                    .referral-code-display {
                        display: flex;
                        align-items: center;
                        background-color: ${s.neutral100};
                        border: 1px dashed ${s.neutral300};
                        padding: 0.75rem;
                        border-radius: 0.5rem;
                        font-family: monospace;
                        font-size: 1.25rem;
                        font-weight: 700;
                        color: ${s.primary500};
                        justify-content: space-between;
                        -webkit-user-select: all;
                        -moz-user-select: all;
                        -ms-user-select: all;
                        user-select: all;
                    }
                    .info-toggle-item {
                        border: 1px solid ${s.neutral200};
                        border-radius: 0.5rem;
                        margin-bottom: 0.5rem;
                        overflow: hidden;
                    }
                    .info-toggle-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 0.75rem 1rem;
                        background-color: ${s.neutral100};
                        cursor: pointer;
                    }
                    .info-toggle-header:hover {
                        background-color: ${s.neutral200};
                    }
                    .info-toggle-content {
                        padding: 1rem;
                        background-color: white;
                        display: none;
                    }
                    .info-toggle-icon {
                        transition: transform 0.3s ease;
                    }
                    .info-toggle-icon.rotate {
                        transform: rotate(180deg);
                    }
                    .profile-picture-wrapper:hover #profile-picture-overlay {
                        opacity: 1;
                    }
                </style>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; display:none;">
                    <h2 style="font-size: 1.5rem; font-weight: 800; color: ${s.neutral900}; margin: 0;">My Profile</h2>
                </div>
                
                <div id="profile-header-card" class="profile-card" style="text-align: center;">
                    <div id="profile-picture-wrapper" style="width: 100px; height: 100px; border-radius: 9999px; overflow: hidden; margin: 0 auto 1rem auto; position: relative; border: 3px solid ${s.primary500}; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); cursor: pointer;">
                        <img id="profile-picture" src="https://ui-avatars.com/api/?name=User&background=00BEFC&color=fff&size=100" alt="Profile Picture" style="width: 100%; height: 100%; object-fit: cover;">
                        <div id="profile-picture-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem; opacity: 0; transition: opacity 0.3s ease;">
                            <i class="fas fa-camera"></i>
                        </div>
                    </div>
                    <input type="file" id="profile-picture-input" accept="image/*" style="display: none;">
                    <h3 id="profile-user-name" style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.25rem; color: ${s.neutral900};">Loading...</h3>
                    <p id="profile-user-email" style="font-size: 0.95rem; color: ${s.neutral700}; margin-bottom: 1rem;">Loading...</p>
                    <div id="profile-verification-status">
                        <span id="verified-badge" style="display: none; align-items: center; gap: 6px; background-color: ${s.neutral100}; color: ${s.success500}; padding: 6px 12px; border-radius: 9999px; font-size: 0.85rem; font-weight: 600;">
                            <i class="fas fa-check-circle"></i> Verified
                        </span>
                    </div>
                </div>

                <div id="account-settings-section" class="profile-card">
                    <h3 class="profile-section-title">Account Settings</h3>
                    <form id="profile-settings-form">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.9rem; color: ${s.neutral700}; margin-bottom: 0.5rem; font-weight: 500;" for="user-name-input">Name</label>
                            <input type="text" id="user-name-input" class="input-field" placeholder="Enter your name">
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.9rem; color: ${s.neutral700}; margin-bottom: 0.5rem; font-weight: 500;" for="user-phone-input">Phone</label>
                            <input type="tel" id="user-phone-input" class="input-field" placeholder="Enter your phone number">
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                            <button type="submit" id="save-profile-btn" class="btn-primary-referral">Save Changes</button>
                        </div>
                    </form>
                </div>

                <div id="referral-section" class="profile-card">
                    <h3 class="profile-section-title">Referral Program</h3>
                    <p style="font-size: 0.95rem; color: ${s.neutral700}; margin-bottom: 1rem;">Share your referral code and get a special discount when your friends make their first booking.</p>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-size: 0.9rem; color: ${s.neutral700}; margin-bottom: 0.5rem; font-weight: 500;">Your Referral Code:</label>
                        <div id="referral-code-display" class="referral-code-display" style="position: relative;">
                            <span id="user-referral-code">LOADING...</span>
                            <i class="fas fa-copy" id="copy-referral-btn" style="cursor: pointer; color: ${s.neutral700};"></i>
                        </div>
                        <p style="font-size: 0.8rem; color: ${s.neutral700}; margin-top: 0.5rem;">Click to copy the code.</p>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-size: 0.9rem; color: ${s.neutral700}; margin-bottom: 0.5rem; font-weight: 500;">Shareable Link:</label>
                        <div id="share-link-display" class="referral-code-display" style="position: relative; font-size: 0.875rem; overflow-x: auto; white-space: nowrap;">
                            <span id="share-link-text">LOADING...</span>
                            <i class="fas fa-copy" id="copy-link-btn" style="cursor: pointer; color: ${s.neutral700};"></i>
                        </div>
                        <p style="font-size: 0.8rem; color: ${s.neutral700}; margin-top: 0.5rem;">This link automatically applies your referral code.</p>
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <label style="display: block; font-size: 0.9rem; color: ${s.neutral700}; margin-bottom: 0.5rem; font-weight: 500;">Enter a Friend's Referral Code:</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" id="friend-referral-code" placeholder="Enter code here" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid ${s.neutral300}; border-radius: 9999px; font-size: 1rem; color: ${s.neutral800}; background-color: white; box-sizing: border-box; -webkit-transition: border-color 0.3s ease, box-shadow 0.3s ease; -o-transition: border-color 0.3s ease, box-shadow 0.3s ease; transition: border-color 0.3s ease, box-shadow 0.3s ease; flex-grow: 1;">
                            <button id="apply-referral-btn" style="background-color: ${s.primary500}; color: white; padding: 0.75rem 1rem; border-radius: 9999px; font-weight: 600; border: none; -webkit-transition: background-color 0.3s ease; -o-transition: background-color 0.3s ease; transition: background-color 0.3s ease; cursor: pointer;">Apply</button>
                        </div>
                    </div>
                </div>

                <div id="info-section" class="profile-card">
                    <h3 class="profile-section-title">Information</h3>
                    <div id="info-list">
                        <div class="info-toggle-item">
                            <div class="info-toggle-header" id="faq-toggle-header">
                                <span style="font-weight: 600; color: ${s.neutral800};">FAQ (Frequently Asked Questions)</span>
                                <i class="fas fa-chevron-down info-toggle-icon"></i>
                            </div>
                            <div class="info-toggle-content" id="faq-content"></div>
                        </div>
                        <div class="info-toggle-item">
                            <div class="info-toggle-header" id="tnc-toggle-header">
                                <span style="font-weight: 600; color: ${s.neutral800};">Terms and Conditions</span>
                                <i class="fas fa-chevron-down info-toggle-icon"></i>
                            </div>
                            <div class="info-toggle-content" id="tnc-content"></div>
                        </div>
                        <div class="info-toggle-item">
                            <div class="info-toggle-header" id="refund-toggle-header">
                                <span style="font-weight: 600; color: ${s.neutral800};">Refund Policy</span>
                                <i class="fas fa-chevron-down info-toggle-icon"></i>
                            </div>
                            <div class="info-toggle-content" id="refund-content"></div>
                        </div>
                    </div>
                </div>

                <div id="profile-actions-section" class="profile-card">
                    <h3 class="profile-section-title">Account Actions</h3>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <button id="logout-btn" style="width: 100%; padding: 0.75rem; border-radius: 9999px; background-color: ${s.neutral100}; color: ${s.neutral800}; font-weight: 600; border: 1px solid ${s.neutral200}; cursor: pointer; transition: background-color 0.3s ease;">Logout</button>
                    </div>
                </div>
            </div>
        `;
    },
    afterRender: async () => {
        // Cek apakah user sudah login, jika tidak, arahkan ke halaman auth
        const user = firebase.auth().currentUser;
        if (!user) {
            location.hash = '/auth';
            return;
        }
        
        const s = Profile.styles;
        const profileUserName = document.getElementById('profile-user-name');
        const profileUserEmail = document.getElementById('profile-user-email');
        const profilePicture = document.getElementById('profile-picture');
        const verifiedBadge = document.getElementById('verified-badge');
        const userReferralCodeSpan = document.getElementById('user-referral-code');
        const copyReferralBtn = document.getElementById('copy-referral-btn');
        const shareLinkText = document.getElementById('share-link-text');
        const copyLinkBtn = document.getElementById('copy-link-btn');
        const friendReferralCodeInput = document.getElementById('friend-referral-code');
        const applyReferralBtn = document.getElementById('apply-referral-btn');
        const userNameInput = document.getElementById('user-name-input');
        const userPhoneInput = document.getElementById('user-phone-input');
        const saveProfileBtn = document.getElementById('save-profile-btn');
        const profilePictureInput = document.getElementById('profile-picture-input');
        const profilePictureWrapper = document.getElementById('profile-picture-wrapper');
        const logoutBtn = document.getElementById('logout-btn');

        const currentUserId = user.uid;
        const baseUrl = window.location.origin + window.location.pathname;

        const showPopup = (title, text, icon) => {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ title, text, icon });
            } else {
                alert(`${title}: ${text}`);
            }
        };

        const fetchUserProfile = async () => {
            const userRef = firebase.database().ref(`users/${currentUserId}`);
            userRef.on('value', (snapshot) => {
                const user = snapshot.val();
                if (user) {
                    profileUserName.textContent = user.name || 'User';
                    profileUserEmail.textContent = user.email || 'N/A';
                    userNameInput.value = user.name || '';
                    userPhoneInput.value = user.phone || '';
                    if (user.photoURL) {
                        profilePicture.src = user.photoURL;
                    } else {
                        profilePicture.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=00BEFC&color=fff&size=100`;
                    }
                    if (user.emailVerified) {
                        verifiedBadge.style.display = 'flex';
                    }
                }
            });
        };

        const fetchReferralCode = async () => {
            const userRef = firebase.database().ref(`users/${currentUserId}`);
            userRef.once('value').then(async (snapshot) => {
                let user = snapshot.val();
                let referralCode = user?.referralCode;
                if (!referralCode) {
                    referralCode = 'STORA' + Math.random().toString(36).substring(2, 8).toUpperCase();
                    await userRef.update({ referralCode: referralCode });
                }
                userReferralCodeSpan.textContent = referralCode;
                shareLinkText.textContent = `${baseUrl}?ref=${referralCode}`;
            }).catch(error => {
                console.error("Error fetching/creating referral code:", error);
                showPopup('Error', 'Failed to load referral code.', 'error');
            });
        };
        
        copyReferralBtn.addEventListener('click', () => {
            const code = userReferralCodeSpan.textContent;
            navigator.clipboard.writeText(code).then(() => {
                showPopup('Copied!', 'Referral code has been copied to your clipboard.', 'success');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                showPopup('Error', 'Failed to copy referral code.', 'error');
            });
        });
        
        copyLinkBtn.addEventListener('click', () => {
            const link = shareLinkText.textContent;
            navigator.clipboard.writeText(link).then(() => {
                showPopup('Copied!', 'Shareable link has been copied to your clipboard.', 'success');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                showPopup('Error', 'Failed to copy shareable link.', 'error');
            });
        });

        applyReferralBtn.addEventListener('click', async () => {
            const friendCode = friendReferralCodeInput.value.trim();
            if (!friendCode) {
                showPopup('Empty Input', 'Please enter a referral code.', 'warning');
                return;
            }
            if (friendCode === userReferralCodeSpan.textContent) {
                showPopup('Invalid Code', 'You cannot use your own referral code.', 'error');
                return;
            }
            
            const usersRef = firebase.database().ref('users');
            const snapshot = await usersRef.orderByChild('referralCode').equalTo(friendCode).once('value');
            if (snapshot.exists()) {
                const friendId = Object.keys(snapshot.val())[0];
                const currentUserRef = firebase.database().ref(`users/${currentUserId}`);
                await currentUserRef.update({ appliedReferralCode: friendCode });
                showPopup('Success!', 'Referral code applied successfully. A discount will be added to your next booking!', 'success');
            } else {
                showPopup('Code Not Found', 'The referral code is invalid or not found.', 'error');
            }
        });
        
        saveProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const newName = userNameInput.value;
            const newPhone = userPhoneInput.value;
            const userRef = firebase.database().ref(`users/${currentUserId}`);

            try {
                await userRef.update({
                    name: newName,
                    phone: newPhone,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                });
                showPopup('Success!', 'Profile updated successfully.', 'success');
            } catch (error) {
                console.error("Error updating profile:", error);
                showPopup('Error', 'Failed to update profile.', 'error');
            }
        });

        profilePictureWrapper.addEventListener('click', () => {
            profilePictureInput.click();
        });

        profilePictureInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const storageRef = firebase.storage().ref(`profile_pictures/${currentUserId}/${Date.now()}-${file.name}`);
            const uploadTask = storageRef.put(file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    showPopup('Uploading...', 'Please wait while your photo is being uploaded.', 'info');
                },
                (error) => {
                    console.error("Upload failed:", error);
                    showPopup('Upload Failed', 'An error occurred during photo upload.', 'error');
                },
                () => {
                    uploadTask.snapshot.ref.getDownloadURL().then(async (downloadURL) => {
                        const userRef = firebase.database().ref(`users/${currentUserId}`);
                        await userRef.update({ photoURL: downloadURL });
                        profilePicture.src = downloadURL;
                        showPopup('Success!', 'Profile picture updated successfully.', 'success');
                    });
                }
            );
        });

        const setupAccordion = (toggleId, contentId, dataPath) => {
            const header = document.getElementById(toggleId);
            const contentDiv = document.getElementById(contentId);
            const icon = header.querySelector('.info-toggle-icon');

            header.addEventListener('click', async () => {
                const isExpanded = contentDiv.style.display === 'block';
                contentDiv.style.display = isExpanded ? 'none' : 'block';
                icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';

                if (!isExpanded && contentDiv.innerHTML === '') {
                    contentDiv.innerHTML = `<p style="text-align: center; color: ${s.neutral700};">Loading...</p>`;
                    const dataRef = firebase.database().ref(dataPath);
                    dataRef.once('value').then(snapshot => {
                        const data = snapshot.val();
                        if (data) {
                            let htmlContent = '';
                            Object.values(data).forEach(item => {
                                htmlContent += `
                                    <div style="margin-bottom: 1rem;">
                                        <h4 style="font-weight: 600; color: ${s.neutral800}; margin-bottom: 0.5rem;">${item.q || item.title}</h4>
                                        <p style="color: ${s.neutral700};">${item.a || item.content}</p>
                                    </div>
                                `;
                            });
                            contentDiv.innerHTML = htmlContent;
                        } else {
                            contentDiv.innerHTML = `<p style="text-align: center; color: ${s.neutral700};">No content found.</p>`;
                        }
                    }).catch(error => {
                        console.error(`Error fetching ${dataPath}:`, error);
                        contentDiv.innerHTML = `<p style="text-align: center; color: ${s.danger500};">Failed to load content.</p>`;
                    });
                }
            });
        };

        setupAccordion('faq-toggle-header', 'faq-content', 'faqs');
        setupAccordion('tnc-toggle-header', 'tnc-content', 'tnc');
        setupAccordion('refund-toggle-header', 'refund-content', 'refundPolicy');

        logoutBtn.addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                showPopup('Logout Successful', 'You have been successfully logged out.', 'success').then(() => {
                    location.hash = '/auth';
                });
            }).catch((error) => {
                console.error("Error logging out:", error);
                showPopup('Logout Failed', 'An error occurred during logout.', 'error');
            });
        });

        fetchUserProfile();
        fetchReferralCode();
    }
};

export default Profile;