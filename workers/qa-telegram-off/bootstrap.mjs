// Isolated QA hostname bootstrap only. No Tracking, no providers, no secrets.
export default {
  async fetch() {
    return new Response(JSON.stringify({
      ok:true,
      environment:"QA_BOOTSTRAP_ONLY",
      production_erp:false,
      tracking_executed:false,
    }),{
      status:200,
      headers:{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
      },
    });
  },
};
