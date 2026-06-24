/// x402 (HTTP 402 Payment Required) middleware - implements the "exact" scheme header
/// format from https://github.com/coinbase/x402 for parsing the client's X-PAYMENT header
/// and generating the 402 challenge body when it's missing or invalid.
///
/// NOTE: x402's reference "exact" scheme settles via EIP-3009 transferWithAuthorization
/// on an ERC-20 USDC contract. Arc's USDC is the chain's *native* gas token, not an ERC-20,
/// so transferWithAuthorization doesn't apply directly here. This middleware still parses
/// and validates the standard X-PAYMENT payload shape (so x402-speaking agent clients work
/// unmodified); settlement of the authorized amount happens through QorbitpayRouter rather
/// than by calling the asset contract, which is what /api/pay does with the parsed payload.

const X402_VERSION = 1;

class X402PaymentError extends Error {}

function parsePaymentHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    throw new X402PaymentError('missing X-PAYMENT header');
  }
  let json;
  try {
    json = Buffer.from(headerValue, 'base64').toString('utf8');
  } catch {
    throw new X402PaymentError('X-PAYMENT header is not valid base64');
  }
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new X402PaymentError('X-PAYMENT header is not valid JSON');
  }

  if (payload.scheme !== 'exact') {
    throw new X402PaymentError(`unsupported x402 scheme: ${payload.scheme}`);
  }
  const auth = payload.payload?.authorization;
  if (!auth || !auth.from || !auth.to || !auth.value) {
    throw new X402PaymentError('payload.authorization must include from, to, value');
  }
  if (!payload.payload?.signature) {
    throw new X402PaymentError('payload.signature is required');
  }
  return payload;
}

function paymentRequiredBody({ amount, asset, payTo, network, maxTimeoutSeconds, description, resource }) {
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: 'exact',
        network,
        maxAmountRequired: amount,
        resource: { url: resource, description },
        payTo,
        asset,
        maxTimeoutSeconds: maxTimeoutSeconds || 60,
        extra: { assetTransferMethod: 'native' },
      },
    ],
  };
}

/// Express middleware factory: gates a route behind an x402 payment challenge.
function requirePayment(options) {
  return (req, res, next) => {
    const header = req.headers['x-payment'];
    if (!header) {
      return res.status(402).json(paymentRequiredBody({ ...options, resource: req.originalUrl }));
    }
    try {
      req.x402Payment = parsePaymentHeader(header);
      next();
    } catch (err) {
      res.status(402).json({
        ...paymentRequiredBody({ ...options, resource: req.originalUrl }),
        error: err.message,
      });
    }
  };
}

export { parsePaymentHeader, paymentRequiredBody, requirePayment, X402PaymentError };
