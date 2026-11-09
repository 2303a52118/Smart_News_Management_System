import api from './api'

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const allowedTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

export function validateImageSelection(file) {
  const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
  if (!file.type || allowedTypes.get(extension) !== file.type) {
    throw new Error('Choose a JPG, JPEG, PNG, or WEBP image.')
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image files must be 5 MB or smaller.')
  }
}

export async function uploadImage(endpoint, file) {
  validateImageSelection(file)
  const body = new FormData()
  body.append('image', file)
  const { data } = await api.post(endpoint, body)
  return data.imageUrl
}
