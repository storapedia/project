exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Metode Tidak Diizinkan. Gunakan POST.' }),
    };
  }

  let invoiceData;
  try {
    invoiceData = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Permintaan Body Tidak Valid. Harus JSON.' }),
    };
  }

  if (!invoiceData || !invoiceData.customerName || !invoiceData.items || !Array.isArray(invoiceData.items)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Data invoice tidak lengkap. Harap sertakan customerName dan items.' }),
    };
  }

  let totalAmount = 0;
  invoiceData.items.forEach(item => {
    if (item.quantity && item.unitPrice) {
      totalAmount += item.quantity * item.unitPrice;
    }
  });

  const generatedInvoice = {
    invoiceId: `INV-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    customerName: invoiceData.customerName,
    items: invoiceData.items,
    totalAmount: totalAmount,
    currency: "IDR"
  };

  try {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(generatedInvoice),
    };
  } catch (error) {
    console.error('Error generating invoice:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Gagal menghasilkan invoice.', error: error.message }),
    };
  }
};
