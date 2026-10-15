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
  AdditionalWorkRequest: require('./AdditionalWorkRequest'),
  Payment: require('./Payment'),
  Receipt: require('./Receipt'),
  Invoice: require('./Invoice'),
  Notification: require('./Notification'),
  MaintenanceReminder: require('./MaintenanceReminder'),
  EmailOtp: require('./EmailOtp'),
  Counter: require('./Counter'),
};
