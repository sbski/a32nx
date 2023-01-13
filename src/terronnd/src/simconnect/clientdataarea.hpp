#pragma once

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#pragma clang diagnostic ignored "-Wundef"
#include <SimConnect.h>
#pragma clang diagnostic pop
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

#include "../base/changeable.hpp"

namespace simconnect {

class Connection;

class ClientDataAreaBase : public base::Changeable {
  friend Connection;

 protected:
  HANDLE* _connection;
  std::uint32_t _dataId;
  std::uint32_t _definitionId;
  bool _alwaysChanges;

  ClientDataAreaBase(HANDLE* connection, std::uint32_t dataId, std::uint32_t definitionId)
      : _connection(connection), _dataId(dataId), _definitionId(definitionId), _alwaysChanges(false) {}
  ClientDataAreaBase(const ClientDataAreaBase&) = delete;

  ClientDataAreaBase& operator=(const ClientDataAreaBase&) = delete;

  virtual void receivedData(void* data) = 0;

 public:
  virtual ~ClientDataAreaBase() override {}

  void setAlwaysChanges(bool alwaysChanges) { this->_alwaysChanges = alwaysChanges; }

  bool requestArea(SIMCONNECT_CLIENT_DATA_PERIOD period) {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result;
    result = SimConnect_RequestClientData(*this->_connection, this->_dataId, this->_dataId, this->_definitionId, period,
                                          SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT);
    return SUCCEEDED(result);
  }
};

template <typename T>
class ClientDataArea : public ClientDataAreaBase {
  friend Connection;

 private:
  T _content;

  ClientDataArea(HANDLE* connection, std::uint32_t dataId, std::uint32_t definitionId)
      : ClientDataAreaBase(connection, dataId, definitionId), _content() {}
  ClientDataArea(const ClientDataArea<T>&) = delete;

  ClientDataArea<T>& operator=(const ClientDataArea<T>&) = delete;

  void receivedData(void* data) override {
    bool changed = this->_alwaysChanges || std::memcmp(data, &this->_content, sizeof(T)) != 0;
    if (changed) {
      std::memcpy(&this->_content, data, sizeof(T));
      this->changed();
    }
  }

 public:
  virtual ~ClientDataArea() {}

  bool defineArea(const std::string& name) {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result = S_OK;
    result &= SimConnect_MapClientDataNameToID(*this->_connection, name.c_str(), this->_dataId);
    result &= SimConnect_AddToClientDataDefinition(*this->_connection, this->_definitionId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, sizeof(T));
    if (SUCCEEDED(result)) {
      std::cout << "TERR ON ND: Defined client area: " << name << std::endl;
    } else {
      std::cerr << "TERR ON ND: Unable to to create client area: " << name << std::endl;
    }

    return SUCCEEDED(result);
  }

  bool allocateArea(bool readOnlyForOthers) {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result;
    result = SimConnect_CreateClientData(
        *this->_connection, this->_dataId, sizeof(T),
        readOnlyForOthers ? SIMCONNECT_CREATE_CLIENT_DATA_FLAG_READ_ONLY : SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    return SUCCEEDED(result);
  }

  bool setArea() {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result;
    result = SimConnect_SetClientData(*this->_connection, this->_dataId, this->_definitionId, SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT, 0,
                                      sizeof(T), &this->_content);
    return SUCCEEDED(result);
  }

  T& data() { return this->_content; }

  const T& data() const { return this->_content; }
};

template <typename T, std::size_t ChunkSize>
class ClientDataAreaBuffered : public ClientDataAreaBase {
  friend Connection;

 private:
  std::vector<T> _content;
  std::size_t _expectedByteCount;
  std::size_t _receivedBytes;

  ClientDataAreaBuffered(HANDLE* connection, std::uint32_t dataId, std::uint32_t definitionId)
      : ClientDataAreaBase(connection, dataId, definitionId), _content() {}
  ClientDataAreaBuffered(const ClientDataAreaBuffered<T, ChunkSize>&) = delete;

  ClientDataAreaBuffered<T, ChunkSize>& operator=(const ClientDataAreaBuffered<T, ChunkSize>&) = delete;

  void receivedData(void* data) override {
    std::size_t remainingBytes = this->_expectedByteCount - this->_receivedBytes;
    if (remainingBytes > ChunkSize) {
      remainingBytes = ChunkSize;
    }

    std::memcpy(&this->_content.data()[this->_receivedBytes], data, remainingBytes);
    this->_receivedBytes += remainingBytes;

    if (this->_receivedBytes >= this->_expectedByteCount) {
      this->changed();
    }
  }

 public:
  virtual ~ClientDataAreaBuffered() {}

  bool defineArea(const std::string& name) {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result = S_OK;
    result &= SimConnect_MapClientDataNameToID(*this->_connection, name.c_str(), this->_dataId);
    result &= SimConnect_AddToClientDataDefinition(*this->_connection, this->_definitionId, SIMCONNECT_CLIENTDATAOFFSET_AUTO, ChunkSize);
    if (SUCCEEDED(result)) {
      std::cout << "TERR ON ND: Defined client area: " << name << std::endl;
    } else {
      std::cerr << "TERR ON ND: Unable to to create client area: " << name << std::endl;
    }

    return SUCCEEDED(result);
  }

  bool allocateArea(bool readOnlyForOthers) {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result;
    result = SimConnect_CreateClientData(
        *this->_connection, this->_dataId, sizeof(T),
        readOnlyForOthers ? SIMCONNECT_CREATE_CLIENT_DATA_FLAG_READ_ONLY : SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    return SUCCEEDED(result);
  }

  bool setArea() {
    if (*this->_connection == 0) {
      return false;
    }

    HRESULT result = S_OK;
    std::size_t sentBytes = 0;

    while (sentBytes < this->_content.size()) {
      std::size_t remainingBytes = this->_content.size() - sentBytes;

      if (remainingBytes >= ChunkSize) {
        result &= SimConnect_SetClientData(*this->_connection, this->_dataId, this->_definitionId, SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT,
                                           0, ChunkSize, &this->_content.data()[sentBytes]);
        sentBytes += ChunkSize;
      } else {
        std::array<T, ChunkSize> buffer{};
        std::memcpy(buffer.data(), &this->_content.data()[sentBytes], remainingBytes);
        result &= SimConnect_SetClientData(*this->_connection, this->_dataId, this->_definitionId, SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT,
                                           0, ChunkSize, buffer.data());
        sentBytes += remainingBytes;
      }
    }

    return SUCCEEDED(result);
  }

  void reserve(std::size_t expectedByteCount) {
    this->_expectedByteCount = expectedByteCount;
    this->_content.reserve(expectedByteCount);
    this->_receivedBytes = 0;
  }

  std::vector<T>& data() { return this->_content; }

  const std::vector<T>& data() const { return this->_content; }
};

}  // namespace simconnect
