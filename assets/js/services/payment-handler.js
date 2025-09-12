export async function createIpaymuInvoice(bookingData) {
  if (!bookingData || !bookingData.selectedSpaces || bookingData.selectedSpaces.length === 0) {
    console.error("Booking Data Error: Data is incomplete or no units were selected.");
    throw new Error("Incomplete booking data.");
  }

  const payload = {
    products: bookingData.selectedSpaces.map(item => item.name),
    prices: bookingData.selectedSpaces.map(item => item.price),
    quantities: bookingData.selectedSpaces.map(item => item.quantity),
    buyerName: bookingData.name,
    buyerEmail: bookingData.email,
    buyerPhone: bookingData.phone,
    totalPrice: bookingData.totalPrice
  };

  console.log("Payload to be sent to the server:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch('/api/ipaymu-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        message: 'Server did not provide error details.' 
      }));
      console.error('Server responded with an error:', response.status, errorData);
      throw new Error(`Failed to create payment invoice. Server responded with: ${errorData.message || response.statusText}`);
    }

    const responseData = await response.json();
    console.log("Invoice created successfully:", responseData);
    
    if (responseData.invoice_url) {
        window.location.href = responseData.invoice_url;
    }
    
    return responseData;

  } catch (error) {
    console.error('Error calling the payment API:', error);
    throw new Error('Failed to contact server to create payment.');
  }
}