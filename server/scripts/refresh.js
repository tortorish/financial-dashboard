import "dotenv/config";
import { refreshFunds } from "../services/fundData.js";

try {
  const result = await refreshFunds();
  console.log(
    JSON.stringify(
      {
        status: result.meta.status,
        funds: result.data.funds.length,
        errors: result.data.errors,
        cacheUpdatedAt: result.meta.freshness.cacheUpdatedAt
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
