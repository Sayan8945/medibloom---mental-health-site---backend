const mongoose = require('mongoose');

const surveyResponseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // allow anonymous for now
      index: true,
    },
    email:    { type: String, default: '' },
    fullName: { type: String, default: '' },
    basicInfo:  { type: Object, default: {} },
    lifestyle:  { type: Object, default: {} },
    stress:     { type: Object, default: {} },
    emotional:  { type: Object, default: {} },
    anxiety:    { type: Object, default: {} },
    depression: { type: Object, default: {} },
    social:     { type: Object, default: {} },
    digital:    { type: Object, default: {} },
    coping:     { type: Object, default: {} },
    history:    { type: Object, default: {} },
    consent:    { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SurveyResponse', surveyResponseSchema);
