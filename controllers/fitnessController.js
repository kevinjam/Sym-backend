'use strict';

const mongoose = require('mongoose');
const FitnessProfile = require('../models/FitnessProfile');
const { MUSCLE_GROUPS, RUNNING_DISTANCE_PRESETS } = require('../services/fitnessCatalog');
const { exercisesFor } = require('../services/fitnessExerciseService');

function patientObjectId(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

function activityPayload(doc) {
  const now = new Date();
  return {
    steps: doc?.steps ?? 0,
    stepGoal: doc?.stepGoal ?? 0,
    distanceMiles: doc?.distanceMiles ?? 0,
    caloriesKcal: doc?.caloriesKcal ?? 0,
    activeMinutes: doc?.activeMinutes ?? 0,
    asOf: (doc?.activityAsOf || now).toISOString(),
  };
}

async function getFitness(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    await FitnessProfile.updateOne(
      { patientId },
      {
        $setOnInsert: {
          patientId,
          stepGoal: 0,
          steps: 0,
          distanceMiles: 0,
          caloriesKcal: 0,
          activeMinutes: 0,
          activityAsOf: new Date(),
        },
      },
      { upsert: true }
    );
    const doc = await FitnessProfile.findOne({ patientId }).lean();

    return res.json({
      success: true,
      data: {
        muscleGroups: MUSCLE_GROUPS,
        runningDistancePresets: RUNNING_DISTANCE_PRESETS,
        activity: activityPayload(doc),
      },
    });
  } catch (e) {
    console.error('[fitness] getFitness:', e);
    return res.status(500).json({ success: false, message: 'fitness_fetch_failed' });
  }
}

async function putFitnessProfile(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const body = req.body || {};
    const patch = {};

    if (body.stepGoal != null) {
      const g = parseInt(body.stepGoal, 10);
      if (!Number.isNaN(g) && g >= 0 && g <= 50000) patch.stepGoal = g;
    }
    if (body.steps != null) {
      const s = parseInt(body.steps, 10);
      if (!Number.isNaN(s) && s >= 0) patch.steps = s;
    }
    if (body.distanceMiles != null) {
      const d = parseFloat(body.distanceMiles);
      if (!Number.isNaN(d) && d >= 0) patch.distanceMiles = d;
    }
    if (body.caloriesKcal != null) {
      const c = parseInt(body.caloriesKcal, 10);
      if (!Number.isNaN(c) && c >= 0) patch.caloriesKcal = c;
    }
    if (body.activeMinutes != null) {
      const a = parseInt(body.activeMinutes, 10);
      if (!Number.isNaN(a) && a >= 0) patch.activeMinutes = a;
    }
    patch.activityAsOf = new Date();

    const doc = await FitnessProfile.findOneAndUpdate(
      { patientId },
      { $set: patch },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        muscleGroups: MUSCLE_GROUPS,
        runningDistancePresets: RUNNING_DISTANCE_PRESETS,
        activity: activityPayload(doc),
      },
    });
  } catch (e) {
    console.error('[fitness] putFitnessProfile:', e);
    return res.status(500).json({ success: false, message: 'fitness_update_failed' });
  }
}

async function postFitnessExercises(req, res) {
  try {
    const muscleGroup = String(req.body?.muscleGroup || '').trim();
    const environment = String(req.body?.environment || 'gym').trim();
    if (!muscleGroup) {
      return res.status(400).json({ success: false, message: 'muscleGroup required' });
    }
    const list = exercisesFor(muscleGroup, environment);
    return res.json({ success: true, data: { exercises: list } });
  } catch (e) {
    console.error('[fitness] postFitnessExercises:', e);
    return res.status(500).json({ success: false, message: 'exercises_failed' });
  }
}

module.exports = {
  getFitness,
  putFitnessProfile,
  postFitnessExercises,
};
