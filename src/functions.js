const { BigNumber } = require("bignumber.js");
const { getReserveNormalizedIncome, rayMul, calculateCompoundedInterest, calculateLinearInterest } = require("@aave/protocol-js")

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const calculateBalance = (data, currentTimestamp) => {
  const balance = new BigNumber();
  if (data.interest_rate_mode === 0) {
    cumulative = calculateLinearInterest(
      new BigNumber(data.current_liquidity_rate),
      currentTimestamp,
      data.last_update,      
    );

    const normalized = rayMul(cumulative, data.liquidity_index);

    return rayMul(data.balance, normalized);
  }
  if (data.interest_rate_mode === 2) {
    const debt = calculateCompoundedInterest(
      new BigNumber(data.current_variable_borrow_rate),
      currentTimestamp,
      data.last_update,
    );

    return rayMul(balance, rayMul(debt, new BigNumber(data.variable_borrow_index)));
  }
};

module.exports = {
  calculateBalance
}
