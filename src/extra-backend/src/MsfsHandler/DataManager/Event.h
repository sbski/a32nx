// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_A32NX_EVENT_H
#define FLYBYWIRE_A32NX_EVENT_H

#include <functional>
#include <map>

#include "EventBase.h"

// TODO: Improve Callbacks
//  Because of the map of callbacks and callbacks being different for normal events and ex1 events
//  the callback function requires all parameters to be passed. This is not optimal and should be
//  improved in the future.

typedef uint64_t CallbackID;
typedef std::function<void(
  int number, DWORD param0, DWORD param1, DWORD param2, DWORD param3,
  DWORD param4)> CallbackFunction;

/**
 * Event class to wrap SimConnect events. Events can be triggered and registered with the sim
 * to get a callback when the event is triggered in the sim.
 */
class Event : public EventBase {
private:
  static constexpr SIMCONNECT_NOTIFICATION_GROUP_ID groupId = 0;

  /**
   * Used to generate unique IDs for callbacks.
   */
  IDGenerator callbackIdGen{};

  /**
   * Map of callbacks to be called when the event is triggered in the sim.
   */
  std::map<CallbackID, CallbackFunction> callbacks;

  /**
   * Flag to indicate if the event is registered with the sim.
   */
  bool isSubscribedToSim = false;

  /**
   * Flag to indicate if the event is masked.
   * From SDK doc: True indicates that the event will be masked by this client and will not be
   * transmitted to any more clients, possibly including Microsoft Flight Simulator
   * itself (if the priority of the client exceeds that of Flight Simulator).
   * False is the default.
   */
  bool maskEvent = false;

public:
  Event() = delete; // no default constructor
  Event(const Event &) = delete; // no copy constructor
  Event &operator=(const Event &) = delete; // no copy assignment
  ~Event() override = default;

  /**
   * Creates an event instance.
   * @param hdlSimConnect The handle of the simconnect connection.
   * @param eventName The name of the event in the sim.
   * @param eventClientId The client's ID of the event to map with the sim event.
   * @param immediateSubscribe Flag to indicate if the event should be subscribed to the sim immediately.
   * @param maskEvent Flag to indicate if the event should be masked.
   *                  From SDK doc: True indicates that the event will be masked by this client and will not be
   *                  transmitted to any more clients, possibly including Microsoft Flight Simulator
   *                  itself (if the priority of the client exceeds that of Flight Simulator).
   *                  False is the default.
   */
  Event(
    HANDLE hdlSimConnect,
    const std::string &eventName,
    SIMCONNECT_CLIENT_EVENT_ID eventClientId,
    bool immediateSubscribe = false,
    bool maskEvent = false);

  /**
   * Subscribes the event to the sim to receive notifications when the event is triggered in the sim.
   * An external class needs to dispatch the sim's messages and call the processEvent method.
   */
  void subscribeToSim();

  /**
   * Unsubscribes the event from the sim.
   */
  void unsubscribeFromSim();

  /**
   * Adds a callback function to be called when the event is triggered in the sim.
   * @param callback
   * @return The ID of the callback.
   */
  [[nodiscard]]
  CallbackID addCallback(const std::function<void(int, DWORD, DWORD, DWORD, DWORD, DWORD)> &callback);

  /**
   * Removes a callback from the event.
   * @param callbackId The ID receive when adding the callback.
   */
  bool removeCallback(CallbackID callbackId);

  /**
   * Called by the DataManager or another class to process the event.
   * @param pEvent pointer to event data
   */
  void processEvent(const SIMCONNECT_RECV_EVENT* pEvent);

  /**
   * Called by the DataManager or another class to process the eex1 vent.
   * @param pEvent pointer to event data
   */
  void processEvent(const SIMCONNECT_RECV_EVENT_EX1* pEvent);

  /**
   * @return string representation of the event
   */
  [[nodiscard]]
  std::string str() const override;
};

#endif //FLYBYWIRE_A32NX_EVENT_H
