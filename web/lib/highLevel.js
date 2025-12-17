export function isHighLevelConfigured() {
  return true;
}

export async function createHighLevelContact(payload) {
  try {
    const response = await fetch('/api/highlevel/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'HighLevel contact creation failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to create HighLevel contact:', error);
    throw error;
  }
}