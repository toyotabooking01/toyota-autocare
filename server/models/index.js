// Register all models at startup so populate() references are available.
module.exports = {
  User: require('./User'),
  Vehicle: require('./Vehicle'),
  ToyotaCatalog: require('./ToyotaCatalog'),
  Service: require('./Service'),
  Booking: require('./Booking'),
  Schedule: require('./Schedule'),
  ServiceBay: require('./ServiceBay'),
  JobOrder: require('./JobOrder'),
  Payment: require('./Payment'),
  Notification: require('./Notification'),
  MaintenanceReminder: require('./MaintenanceReminder'),
  EmailOtp: require('./EmailOtp'),
  Counter: require('./Counter'),
};
