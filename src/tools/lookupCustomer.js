const airtableService = require('../airtableService');

async function handleLookupCustomer(args) {
  try {
    const { phone_number } = args;

    if (!phone_number) {
      return JSON.stringify({
        found: false,
        message: 'No phone number provided'
      });
    }

    const result = await airtableService.lookupByPhone(phone_number);

    if (!result.found) {
      return JSON.stringify({
        found: false,
        message: 'New customer — no previous records found'
      });
    }

    return JSON.stringify({
      found: true,
      name: result.name,
      lastServiceDate: result.lastServiceDate,
      lastServiceType: result.lastServiceType,
      lastTech: result.lastTech,
      totalJobs: result.totalJobs,
      lifetimeValue: result.lifetimeValue,
      message: `Returning customer: ${result.name}. ${result.totalJobs} previous job(s). Last service: ${result.lastServiceType} on ${result.lastServiceDate}.`
    });
  } catch (err) {
    console.error('[lookupCustomer:handleLookupCustomer]', err.message, err);
    return JSON.stringify({
      found: false,
      message: 'Could not look up customer history at this time'
    });
  }
}

module.exports = { handleLookupCustomer };
