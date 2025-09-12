// File: admin/js/uploader.js

/**
 * Mengunggah gambar ke Netlify Blobs melalui Netlify Function menggunakan FormData.
 * @param {File} file - File gambar yang akan diunggah.
 * @returns {Promise<string>} URL publik dari gambar yang diunggah.
 */
export async function uploadImage(file) {
    if (!file) {
        throw new Error("No file selected for upload.");
    }

    try {
        const formData = new FormData();
        formData.append('file', file); // 'file' = field name yg dibaca backend

        const response = await fetch('/.netlify/functions/imageupload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                error: 'Image upload failed with status: ' + response.status
            }));
            throw new Error(errorData.error || 'Image upload failed.');
        }

        const result = await response.json();
        return result.url; // URL gambar publik
    } catch (error) {
        console.error('Upload error:', error);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Upload Failed', error.message, 'error');
        } else {
            alert(`Upload failed: ${error.message}`);
        }
        throw error;
    }
}
