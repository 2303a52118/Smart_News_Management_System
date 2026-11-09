const validateEnv = (environment = process.env) => {
  const requiredVariables = ["MONGO_URI", "JWT_SECRET"];
  const missingVariables = requiredVariables.filter(
    (name) => typeof environment[name] !== "string" || !environment[name].trim()
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingVariables.join(", ")}`
    );
  }

  const port = environment.PORT === undefined ? 5000 : Number(environment.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return { port };
};

module.exports = { validateEnv };
