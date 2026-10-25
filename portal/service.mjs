export async function functionError(error, name = 'portal-admin') {
  let payload;
  try {
    const context = error?.context;
    if (context?.json) payload = await (context.clone ? context.clone() : context).json();
  } catch { /* Fall back to the client error. */ }
  const raw = payload?.error || payload?.message || error?.message || 'The service request failed.';
  let message = typeof raw === 'string' ? raw : 'The service request failed.';
  if (/invalid jwt|jwt.*invalid/i.test(message)) {
    message = `The ${name} gateway rejected the login token. In the Orchestra project, open Edge Functions → ${name} and turn off the legacy Verify JWT setting, then try again.`;
  } else if (/non-2xx/i.test(message)) {
    message = `${name} could not complete the request. Check that the updated function is deployed in the Orchestra project and inspect its latest function log.`;
  } else if (/failed to (send|fetch)|functionsfetcherror/i.test(message)) {
    message = `${name} could not be reached. Check that it is deployed in the Orchestra project, then retry.`;
  }
  const result = new Error(message);
  result.code = payload?.code || error?.code || '';
  result.status = error?.context?.status || error?.status;
  return result;
}
export async function invokeService(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw await functionError(error, name);
  if (data?.error) throw await functionError({ message: data.error, code: data.code }, name);
  return data;
}
