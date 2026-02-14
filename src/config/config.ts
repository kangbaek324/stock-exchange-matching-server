export default () => ({
    DATABASE_URL: process.env.DB_USERNAME,
    SERVER_PORT: process.env.SERVER_PORT,
    RABBITMQ_URL: process.env.RABBITMQ_URL,
});
