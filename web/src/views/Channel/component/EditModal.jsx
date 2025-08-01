import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { CHANNEL_OPTIONS } from 'constants/ChannelConstants';
import { useTheme } from '@mui/material/styles';
import { API } from 'utils/api';
import { showError, showSuccess, trims, copy } from 'utils/common';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  OutlinedInput,
  ButtonGroup,
  Container,
  Autocomplete,
  FormHelperText,
  Checkbox,
  Switch,
  FormControlLabel,
  Typography,
  Tooltip,
  Collapse,
  Box,
  Chip,
  useMediaQuery
} from '@mui/material';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { defaultConfig, typeConfig } from '../type/Config'; //typeConfig
import { createFilterOptions } from '@mui/material/Autocomplete';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useTranslation } from 'react-i18next';
import useCustomizeT from 'hooks/useCustomizeT';
import { PreCostType } from '../type/other';
import MapInput from './MapInput';
import ListInput from './ListInput';
import ModelSelectorModal from './ModelSelectorModal';
import pluginList from '../type/Plugin.json';
import { Icon } from '@iconify/react';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

const filter = createFilterOptions();
const getValidationSchema = (t) =>
  Yup.object().shape({
    is_edit: Yup.boolean(),
    // is_tag: Yup.boolean(),
    name: Yup.string().required(t('channel_edit.requiredName')),
    type: Yup.number().required(t('channel_edit.requiredChannel')),
    key: Yup.string().when('is_edit', { is: false, then: Yup.string().required(t('channel_edit.requiredKey')) }),
    other: Yup.string(),
    proxy: Yup.string(),
    test_model: Yup.string(),
    models: Yup.array().min(1, t('channel_edit.requiredModels')),
    groups: Yup.array().min(1, t('channel_edit.requiredGroup')),
    base_url: Yup.string().when('type', {
      is: (value) => [3, 8].includes(value),
      then: Yup.string().required(t('channel_edit.requiredBaseUrl')), // base_url 是必需的
      otherwise: Yup.string() // 在其他情况下，base_url 可以是任意字符串
    }),
    model_mapping: Yup.array(),
    model_headers: Yup.array(),
    custom_parameter: Yup.string().nullable()
  });

const EditModal = ({ open, channelId, onCancel, onOk, groupOptions, isTag, modelOptions, prices }) => {
  const { t } = useTranslation();
  const { t: customizeT } = useCustomizeT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // const [loading, setLoading] = useState(false);
  const [initialInput, setInitialInput] = useState(defaultConfig.input);
  const [inputLabel, setInputLabel] = useState(defaultConfig.inputLabel); //
  const [inputPrompt, setInputPrompt] = useState(defaultConfig.prompt);
  const [batchAdd, setBatchAdd] = useState(false);
  const [hasTag, setHasTag] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [parameterFocused, setParameterFocused] = useState(false);
  const parameterInputRef = useRef(null);
  const removeDuplicates = (array) => [...new Set(array)];
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [tempFormikValues, setTempFormikValues] = useState(null);
  const [tempSetFieldValue, setTempSetFieldValue] = useState(null);

  const initChannel = (typeValue) => {
    if (typeConfig[typeValue]?.inputLabel) {
      setInputLabel({ ...defaultConfig.inputLabel, ...typeConfig[typeValue].inputLabel });
    } else {
      setInputLabel(defaultConfig.inputLabel);
    }

    if (typeConfig[typeValue]?.prompt) {
      setInputPrompt({ ...defaultConfig.prompt, ...typeConfig[typeValue].prompt });
    } else {
      setInputPrompt(defaultConfig.prompt);
    }

    return typeConfig[typeValue]?.input;
  };

  const handleTypeChange = (setFieldValue, typeValue, values) => {
    // 处理插件事务
    if (pluginList[typeValue]) {
      const newPluginValues = {};
      const pluginConfig = pluginList[typeValue];
      for (const pluginName in pluginConfig) {
        const plugin = pluginConfig[pluginName];
        const oldValve = values['plugin'] ? values['plugin'][pluginName] || {} : {};
        newPluginValues[pluginName] = {};
        for (const paramName in plugin.params) {
          const param = plugin.params[paramName];
          newPluginValues[pluginName][paramName] = oldValve[paramName] || (param.type === 'bool' ? false : '');
        }
      }
      setFieldValue('plugin', newPluginValues);
    }

    const newInput = initChannel(typeValue);

    if (newInput) {
      Object.keys(newInput).forEach((key) => {
        if (
          (!Array.isArray(values[key]) && values[key] !== null && values[key] !== undefined && values[key] !== '') ||
          (Array.isArray(values[key]) && values[key].length > 0)
        ) {
          return;
        }

        if (key === 'models') {
          setFieldValue(key, initialModel(newInput[key]));
          return;
        }
        setFieldValue(key, newInput[key]);
      });
    }
  };

  const basicModels = (channelType) => {
    let modelGroup = typeConfig[channelType]?.modelGroup || defaultConfig.modelGroup;
    // 循环 modelOptions，找到 modelGroup 对应的模型
    let modelList = [];
    modelOptions.forEach((model) => {
      if (model.group === modelGroup) {
        modelList.push(model);
      }
    });
    return modelList;
  };

  const handleModelSelectorConfirm = (selectedModels, overwriteModels) => {
    if (tempSetFieldValue && tempFormikValues) {
      if (overwriteModels) {
        // 覆盖模式：清空现有的模型列表，使用选择器中的模型
        tempSetFieldValue('models', selectedModels);
      } else {
        // 追加模式：合并现有模型和新选择的模型，避免重复
        const existingModels = tempFormikValues.models || [];
        const existingModelIds = new Set(existingModels.map((model) => model.id));

        // 过滤掉已存在的模型，避免重复
        const newModels = selectedModels.filter((model) => !existingModelIds.has(model.id));

        // 合并模型列表
        tempSetFieldValue('models', [...existingModels, ...newModels]);
      }
    }
  };

  const submit = async (values, { setErrors, setStatus, setSubmitting }) => {
    setSubmitting(true);
    values = trims(values);
    if (values.base_url && values.base_url.endsWith('/')) {
      values.base_url = values.base_url.slice(0, values.base_url.length - 1);
    }
    if (values.type === 3 && values.other === '') {
      values.other = '2024-05-01-preview';
    }
    if (values.type === 18 && values.other === '') {
      values.other = 'v2.1';
    }
    let res;

    let modelMappingModel = [];

    if (values.model_mapping) {
      try {
        const modelMapping = values.model_mapping.reduce((acc, item) => {
          if (item.key && item.value) {
            acc[item.key] = item.value;
          }
          return acc;
        }, {});
        const cleanedMapping = {};

        for (const [key, value] of Object.entries(modelMapping)) {
          if (key && value && !(key in cleanedMapping)) {
            cleanedMapping[key] = value;
            modelMappingModel.push(key);
          }
        }

        values.model_mapping = JSON.stringify(cleanedMapping, null, 2);
      } catch (error) {
        showError('Error parsing model_mapping:' + error.message);
      }
    }
    let modelHeadersKey = [];

    if (values.model_headers) {
      try {
        const modelHeader = values.model_headers.reduce((acc, item) => {
          if (item.key && item.value) {
            acc[item.key] = item.value;
          }
          return acc;
        }, {});
        const cleanedHeader = {};

        for (const [key, value] of Object.entries(modelHeader)) {
          if (key && value && !(key in cleanedHeader)) {
            cleanedHeader[key] = value;
            modelHeadersKey.push(key);
          }
        }

        values.model_headers = JSON.stringify(cleanedHeader, null, 2);
      } catch (error) {
        showError('Error parsing model_headers:' + error.message);
      }
    }

    if (values.custom_parameter) {
      try {
        // Validate that the custom_parameter is valid JSON
        JSON.parse(values.custom_parameter);
      } catch (error) {
        showError('Error parsing custom_parameter: ' + error.message);
        return;
      }
    }

    if (values.disabled_stream) {
      values.disabled_stream = removeDuplicates(values.disabled_stream);
    }

    // 获取现有的模型 ID
    const existingModelIds = values.models.map((model) => model.id);

    // 找出在 modelMappingModel 中存在但不在 existingModelIds 中的模型
    const newModelIds = modelMappingModel.filter((id) => !existingModelIds.includes(id));

    // 合并现有的模型 ID 和新的模型 ID，并去重
    const allUniqueModelIds = Array.from(new Set([...existingModelIds, ...newModelIds]));

    // 创建新的 modelsStr
    const modelsStr = allUniqueModelIds.join(',');
    values.group = values.groups.join(',');

    let baseApiUrl = '/api/channel/';

    if (isTag) {
      baseApiUrl = '/api/channel_tag/' + encodeURIComponent(channelId);
    }

    try {
      if (channelId) {
        res = await API.put(baseApiUrl, { ...values, id: parseInt(channelId), models: modelsStr });
      } else {
        res = await API.post(baseApiUrl, { ...values, models: modelsStr });
      }
      const { success, message } = res.data;
      if (success) {
        if (channelId) {
          showSuccess(t('channel_edit.editSuccess'));
        } else {
          showSuccess(t('channel_edit.addSuccess'));
        }
        setSubmitting(false);
        setStatus({ success: true });
        onOk(true);
        return;
      } else {
        setStatus({ success: false });
        showError(message);
        setErrors({ submit: message });
      }
    } catch (error) {
      setStatus({ success: false });
      showError(error.message);
      setErrors({ submit: error.message });
      return;
    }
  };

  function initialModel(channelModel) {
    if (!channelModel) {
      return [];
    }

    // 如果 channelModel 是一个字符串
    if (typeof channelModel === 'string') {
      channelModel = channelModel.split(',');
    }
    let modelList = channelModel.map((model) => {
      const modelOption = modelOptions.find((option) => option.id === model);
      if (modelOption) {
        return modelOption;
      }
      return { id: model, group: t('channel_edit.customModelTip') };
    });
    return modelList;
  }

  const loadChannel = async () => {
    try {
      let baseApiUrl = `/api/channel/${channelId}`;

      if (isTag) {
        baseApiUrl = '/api/channel_tag/' + encodeURIComponent(channelId);
      }

      let res = await API.get(baseApiUrl);
      const { success, message, data } = res.data;
      if (success) {
        if (data.models === '') {
          data.models = [];
        } else {
          data.models = initialModel(data.models);
        }
        if (data.group === '') {
          data.groups = [];
        } else {
          data.groups = data.group.split(',');
        }

        data.model_mapping =
          data.model_mapping !== ''
            ? Object.entries(JSON.parse(data.model_mapping)).map(([key, value], index) => ({
                index,
                key,
                value
              }))
            : [];
        // if (data.model_headers) {
        data.model_headers =
          data.model_headers !== ''
            ? Object.entries(JSON.parse(data.model_headers)).map(([key, value], index) => ({
                index,
                key,
                value
              }))
            : [];
        // }

        // Format the custom_parameter JSON for better readability if it's not empty
        if (data.custom_parameter !== '') {
          try {
            // Parse and then stringify with indentation for formatting
            const parsedJson = JSON.parse(data.custom_parameter);
            data.custom_parameter = JSON.stringify(parsedJson, null, 2);
          } catch (error) {
            // If parsing fails, keep the original string
            console.log('Error parsing custom_parameter JSON:', error);
          }
        } else {
          data.custom_parameter = '';
        }

        data.base_url = data.base_url ?? '';
        data.is_edit = true;
        if (data.plugin === null) {
          data.plugin = {};
        }
        initChannel(data.type);
        setInitialInput(data);

        if (!isTag && data.tag) {
          setHasTag(true);
        }
      } else {
        showError(message);
      }
    } catch (error) {
      return;
    }
  };

  useEffect(() => {
    if (open) {
      setBatchAdd(isTag);
      if (channelId) {
        loadChannel().then();
      } else {
        setHasTag(false);
        initChannel(1);
        setInitialInput({ ...defaultConfig.input, is_edit: false });
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, open]);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth={'md'}>
      <DialogTitle sx={{ margin: '0px', fontWeight: 700, lineHeight: '1.55556', padding: '24px', fontSize: '1.125rem' }}>
        {channelId ? t('common.edit') : t('common.create')}
      </DialogTitle>
      <Divider />
      <DialogContent>
        <Formik initialValues={initialInput} enableReinitialize validationSchema={getValidationSchema(t)} onSubmit={submit}>
          {({ errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values, setFieldValue }) => {
            // 保存当前Formik状态，以便在模型选择器中使用
            const openModelSelector = () => {
              setTempFormikValues({ ...values });
              setTempSetFieldValue(() => setFieldValue); // 保存函数引用
              setModelSelectorOpen(true);
            };

            return (
              <form noValidate onSubmit={handleSubmit}>
                {!isTag && (
                  <FormControl fullWidth error={Boolean(touched.type && errors.type)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-type-label">{customizeT(inputLabel.type)}</InputLabel>
                    <Select
                      id="channel-type-label"
                      label={customizeT(inputLabel.type)}
                      value={values.type}
                      name="type"
                      onBlur={handleBlur}
                      onChange={(e) => {
                        handleChange(e);
                        handleTypeChange(setFieldValue, e.target.value, values);
                      }}
                      disabled={hasTag}
                      MenuProps={{
                        PaperProps: {
                          style: {
                            maxHeight: 200
                          }
                        }
                      }}
                    >
                      {Object.values(CHANNEL_OPTIONS).map((option) => {
                        return (
                          <MenuItem key={option.value} value={option.value}>
                            {option.text}
                          </MenuItem>
                        );
                      })}
                    </Select>
                    {touched.type && errors.type ? (
                      <FormHelperText error id="helper-tex-channel-type-label">
                        {errors.type}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-type-label"> {customizeT(inputPrompt.type)} </FormHelperText>
                    )}
                  </FormControl>
                )}

                <FormControl fullWidth error={Boolean(touched.tag && errors.tag)} sx={{ ...theme.typography.otherInput }}>
                  <InputLabel htmlFor="channel-tag-label">{customizeT(inputLabel.tag)}</InputLabel>
                  <OutlinedInput
                    id="channel-tag-label"
                    label={customizeT(inputLabel.tag)}
                    type="text"
                    value={values.tag}
                    name="tag"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    inputProps={{}}
                    aria-describedby="helper-text-channel-tag-label"
                  />
                  {touched.tag && errors.tag ? (
                    <FormHelperText error id="helper-tex-channel-tag-label">
                      {errors.tag}
                    </FormHelperText>
                  ) : (
                    <FormHelperText id="helper-tex-channel-tag-label"> {customizeT(inputPrompt.tag)} </FormHelperText>
                  )}
                </FormControl>

                {!isTag && (
                  <FormControl fullWidth error={Boolean(touched.name && errors.name)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-name-label">{customizeT(inputLabel.name)}</InputLabel>
                    <OutlinedInput
                      id="channel-name-label"
                      label={customizeT(inputLabel.name)}
                      type="text"
                      value={values.name}
                      name="name"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      inputProps={{ autoComplete: 'name' }}
                      aria-describedby="helper-text-channel-name-label"
                    />
                    {touched.name && errors.name ? (
                      <FormHelperText error id="helper-tex-channel-name-label">
                        {errors.name}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-name-label"> {customizeT(inputPrompt.name)} </FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.base_url && (
                  <FormControl fullWidth error={Boolean(touched.base_url && errors.base_url)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-base_url-label">{customizeT(inputLabel.base_url)}</InputLabel>
                    <OutlinedInput
                      id="channel-base_url-label"
                      label={customizeT(inputLabel.base_url)}
                      type="text"
                      value={values.base_url}
                      name="base_url"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      inputProps={{}}
                      aria-describedby="helper-text-channel-base_url-label"
                    />

                    {touched.base_url && errors.base_url ? (
                      <FormHelperText error id="helper-tex-channel-base_url-label">
                        {errors.base_url}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-base_url-label"> {customizeT(inputPrompt.base_url)} </FormHelperText>
                    )}
                  </FormControl>
                )}

                {inputPrompt.other && (
                  <FormControl fullWidth error={Boolean(touched.other && errors.other)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-other-label">{customizeT(inputLabel.other)}</InputLabel>
                    <OutlinedInput
                      id="channel-other-label"
                      label={customizeT(inputLabel.other)}
                      type="text"
                      value={values.other}
                      name="other"
                      disabled={hasTag}
                      onBlur={handleBlur}
                      onChange={handleChange}
                      inputProps={{}}
                      aria-describedby="helper-text-channel-other-label"
                    />
                    {touched.other && errors.other ? (
                      <FormHelperText error id="helper-tex-channel-other-label">
                        {errors.other}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-other-label"> {customizeT(inputPrompt.other)} </FormHelperText>
                    )}
                  </FormControl>
                )}

                <FormControl fullWidth sx={{ ...theme.typography.otherInput }}>
                  <Autocomplete
                    multiple
                    id="channel-groups-label"
                    options={groupOptions}
                    value={values.groups}
                    disabled={hasTag}
                    onChange={(e, value) => {
                      const event = {
                        target: {
                          name: 'groups',
                          value: value
                        }
                      };
                      handleChange(event);
                    }}
                    onBlur={handleBlur}
                    filterSelectedOptions
                    renderInput={(params) => (
                      <TextField {...params} name="groups" error={Boolean(errors.groups)} label={customizeT(inputLabel.groups)} />
                    )}
                    aria-describedby="helper-text-channel-groups-label"
                  />
                  {errors.groups ? (
                    <FormHelperText error id="helper-tex-channel-groups-label">
                      {errors.groups}
                    </FormHelperText>
                  ) : (
                    <FormHelperText id="helper-tex-channel-groups-label"> {customizeT(inputPrompt.groups)} </FormHelperText>
                  )}
                </FormControl>

                <FormControl fullWidth sx={{ ...theme.typography.otherInput }}>
                  <Box sx={{ position: 'relative' }}>
                    <Autocomplete
                      multiple
                      freeSolo
                      disableCloseOnSelect
                      id="channel-models-label"
                      disabled={hasTag}
                      options={modelOptions}
                      value={values.models}
                      inputValue={inputValue}
                      onInputChange={(event, newInputValue) => {
                        if (newInputValue.includes(',')) {
                          const modelsList = newInputValue
                            .split(',')
                            .map((item) => ({
                              id: item.trim(),
                              group: t('channel_edit.customModelTip')
                            }))
                            .filter((item) => item.id);

                          const updatedModels = [...new Set([...values.models, ...modelsList])];
                          const event = {
                            target: {
                              name: 'models',
                              value: updatedModels
                            }
                          };
                          handleChange(event);
                          setInputValue('');
                        } else {
                          setInputValue(newInputValue);
                        }
                      }}
                      onChange={(e, value) => {
                        const event = {
                          target: {
                            name: 'models',
                            value: value.map((item) =>
                              typeof item === 'string' ? { id: item, group: t('channel_edit.customModelTip') } : item
                            )
                          }
                        };
                        handleChange(event);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          name="models"
                          error={Boolean(errors.models)}
                          label={customizeT(inputLabel.models)}
                          InputProps={{
                            ...params.InputProps
                          }}
                        />
                      )}
                      groupBy={(option) => option.group}
                      getOptionLabel={(option) => {
                        if (typeof option === 'string') {
                          return option;
                        }
                        if (option.inputValue) {
                          return option.inputValue;
                        }
                        return option.id;
                      }}
                      filterOptions={(options, params) => {
                        const filtered = filter(options, params);
                        const { inputValue } = params;
                        const isExisting = options.some((option) => inputValue === option.id);
                        if (inputValue !== '' && !isExisting) {
                          filtered.push({
                            id: inputValue,
                            group: t('channel_edit.customModelTip')
                          });
                        }
                        return filtered;
                      }}
                      renderOption={(props, option, { selected }) => (
                        <li {...props}>
                          <Checkbox icon={icon} checkedIcon={checkedIcon} style={{ marginRight: 8 }} checked={selected} />
                          {option.id}
                        </li>
                      )}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => {
                          const tagProps = getTagProps({ index });
                          return (
                            <Chip
                              key={index}
                              label={option.id}
                              {...tagProps}
                              onClick={() => copy(option.id)}
                              sx={{
                                maxWidth: '100%',
                                height: 'auto',
                                margin: '3px',
                                '& .MuiChip-label': {
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  padding: '6px 8px',
                                  lineHeight: 1.4,
                                  fontWeight: 400
                                },
                                '& .MuiChip-deleteIcon': {
                                  margin: '0 5px 0 -6px'
                                }
                              }}
                            />
                          );
                        })
                      }
                      sx={{
                        '& .MuiAutocomplete-tag': {
                          margin: '2px'
                        },
                        '& .MuiAutocomplete-inputRoot': {
                          flexWrap: 'wrap'
                        }
                      }}
                    />
                  </Box>
                  {errors.models ? (
                    <FormHelperText error id="helper-tex-channel-models-label">
                      {errors.models}
                    </FormHelperText>
                  ) : (
                    <FormHelperText id="helper-tex-channel-models-label"> {customizeT(inputPrompt.models)} </FormHelperText>
                  )}
                </FormControl>
                <Container
                  sx={{
                    textAlign: 'right'
                  }}
                >
                  <ButtonGroup variant="outlined" aria-label="small outlined primary button group">
                    <Button
                      size="small"
                      onClick={() => {
                        const modelString = values.models.map((model) => model.id).join(',');
                        copy(modelString);
                      }}
                    >
                      {isMobile ? <Icon icon="mdi:content-copy" /> : t('channel_edit.copyModels')}
                    </Button>
                    <Button
                      disabled={hasTag}
                      size="small"
                      onClick={() => {
                        setFieldValue('models', basicModels(values.type));
                      }}
                    >
                      {isMobile ? <Icon icon="mdi:playlist-plus" /> : t('channel_edit.inputChannelModel')}
                    </Button>
                    {/* <Button
                      disabled={hasTag}
                      size="small"
                      onClick={() => {
                        setFieldValue('models', modelOptions);
                      }}
                    >
                      {t('channel_edit.inputAllModel')}
                    </Button> */}
                    {inputLabel.provider_models_list && (
                      <Tooltip title={customizeT(inputPrompt.provider_models_list)} placement="top">
                        <Button
                          disabled={hasTag}
                          size="small"
                          onClick={openModelSelector}
                          startIcon={!isMobile && <Icon icon="mdi:cloud-download" />}
                        >
                          {isMobile ? <Icon icon="mdi:cloud-download" /> : customizeT(inputLabel.provider_models_list)}
                        </Button>
                      </Tooltip>
                    )}
                  </ButtonGroup>
                </Container>
                <FormControl fullWidth error={Boolean(touched.key && errors.key)} sx={{ ...theme.typography.otherInput }}>
                  {!batchAdd ? (
                    <>
                      <InputLabel htmlFor="channel-key-label">{customizeT(inputLabel.key)}</InputLabel>
                      <OutlinedInput
                        id="channel-key-label"
                        label={customizeT(inputLabel.key)}
                        type="text"
                        value={values.key}
                        name="key"
                        onBlur={handleBlur}
                        onChange={handleChange}
                        inputProps={{}}
                        aria-describedby="helper-text-channel-key-label"
                      />
                    </>
                  ) : (
                    <TextField
                      multiline
                      id="channel-key-label"
                      label={customizeT(inputLabel.key)}
                      value={values.key}
                      name="key"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      aria-describedby="helper-text-channel-key-label"
                      minRows={5}
                      placeholder={customizeT(inputPrompt.key) + t('channel_edit.batchKeytip')}
                    />
                  )}

                  {touched.key && errors.key ? (
                    <FormHelperText error id="helper-tex-channel-key-label">
                      {errors.key}
                    </FormHelperText>
                  ) : (
                    <FormHelperText id="helper-tex-channel-key-label">
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{customizeT(inputPrompt.key)}</span>
                        {channelId === 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Switch 
                              size="small"
                              checked={Boolean(batchAdd)} 
                              onChange={(e) => setBatchAdd(e.target.checked)} 
                            />
                            <Typography variant="body2">{t('channel_edit.batchAdd')}</Typography>
                          </Box>
                        )}
                      </Box>
                    </FormHelperText>
                  )}
                </FormControl>

                {inputPrompt.model_mapping && (
                  <FormControl
                    fullWidth
                    error={Boolean(touched.model_mapping && errors.model_mapping)}
                    sx={{ ...theme.typography.otherInput }}
                  >
                    <MapInput
                      mapValue={values.model_mapping}
                      onChange={(newValue) => {
                        setFieldValue('model_mapping', newValue);
                      }}
                      disabled={hasTag}
                      error={Boolean(touched.model_mapping && errors.model_mapping)}
                      label={{
                        keyName: customizeT(inputLabel.model_mapping),
                        valueName: customizeT(inputPrompt.model_mapping),
                        name: customizeT(inputLabel.model_mapping)
                      }}
                    />
                    {touched.model_mapping && errors.model_mapping ? (
                      <FormHelperText error id="helper-tex-channel-model_mapping-label">
                        {errors.model_mapping}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-model_mapping-label">{customizeT(inputPrompt.model_mapping)}</FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.model_headers && (
                  <FormControl
                    fullWidth
                    error={Boolean(touched.model_headers && errors.model_headers)}
                    sx={{ ...theme.typography.otherInput }}
                  >
                    <MapInput
                      mapValue={values.model_headers}
                      onChange={(newValue) => {
                        setFieldValue('model_headers', newValue);
                      }}
                      disabled={hasTag}
                      error={Boolean(touched.model_headers && errors.model_headers)}
                      label={{
                        keyName: customizeT(inputLabel.model_headers),
                        valueName: customizeT(inputPrompt.model_headers),
                        name: customizeT(inputLabel.model_headers)
                      }}
                    />
                    {touched.model_headers && errors.model_headers ? (
                      <FormHelperText error id="helper-tex-channel-model_headers-label">
                        {errors.model_headers}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-model_headers-label">{customizeT(inputPrompt.model_headers)}</FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.custom_parameter && (
                  <FormControl
                    fullWidth
                    error={Boolean(touched.custom_parameter && errors.custom_parameter)}
                    sx={{ ...theme.typography.otherInput }}
                  >
                    <TextField
                      id="channel-custom_parameter-label"
                      label={customizeT(inputLabel.custom_parameter)}
                      multiline={Boolean(values.custom_parameter || parameterFocused)}
                      rows={values.custom_parameter || parameterFocused ? 8 : 1}
                      value={values.custom_parameter}
                      name="custom_parameter"
                      disabled={hasTag}
                      error={Boolean(touched.custom_parameter && errors.custom_parameter)}
                      onChange={handleChange}
                      inputRef={parameterInputRef}
                      onBlur={(e) => {
                        handleBlur(e);
                        setParameterFocused(false);
                      }}
                      onFocus={() => {
                        setParameterFocused(true);
                        // 使用setTimeout确保状态更新后重新聚焦
                        setTimeout(() => {
                          if (parameterInputRef.current) {
                            parameterInputRef.current.focus();
                          }
                        }, 0);
                      }}
                      placeholder={
                        parameterFocused
                          ? '{\n  "temperature": 0.7,\n  "top_p": 0.9,\n  "nested_param": {\n      "key": "value"\n  }\n}'
                          : ''
                      }
                    />
                    {touched.custom_parameter && errors.custom_parameter ? (
                      <FormHelperText error id="helper-tex-channel-custom_parameter-label">
                        {errors.custom_parameter}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-custom_parameter-label">
                        {customizeT(inputPrompt.custom_parameter)}
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.disabled_stream && (
                  <FormControl
                    fullWidth
                    error={Boolean(touched.disabled_stream && errors.disabled_stream)}
                    sx={{ ...theme.typography.otherInput }}
                  >
                    <ListInput
                      listValue={values.disabled_stream}
                      onChange={(newValue) => {
                        setFieldValue('disabled_stream', newValue);
                      }}
                      disabled={hasTag}
                      error={Boolean(touched.disabled_stream && errors.disabled_stream)}
                      label={{
                        name: customizeT(inputLabel.disabled_stream),
                        itemName: customizeT(inputPrompt.disabled_stream)
                      }}
                    />
                  </FormControl>
                )}

                <FormControl fullWidth error={Boolean(touched.proxy && errors.proxy)} sx={{ ...theme.typography.otherInput }}>
                  <InputLabel htmlFor="channel-proxy-label">{customizeT(inputLabel.proxy)}</InputLabel>
                  <OutlinedInput
                    id="channel-proxy-label"
                    label={customizeT(inputLabel.proxy)}
                    disabled={hasTag}
                    type="text"
                    value={values.proxy}
                    name="proxy"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    inputProps={{}}
                    aria-describedby="helper-text-channel-proxy-label"
                  />
                  {touched.proxy && errors.proxy ? (
                    <FormHelperText error id="helper-tex-channel-proxy-label">
                      {errors.proxy}
                    </FormHelperText>
                  ) : (
                    <FormHelperText id="helper-tex-channel-proxy-label"> {customizeT(inputPrompt.proxy)} </FormHelperText>
                  )}
                </FormControl>
                {inputPrompt.test_model && (
                  <FormControl fullWidth error={Boolean(touched.test_model && errors.test_model)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-test_model-label">{customizeT(inputLabel.test_model)}</InputLabel>
                    <OutlinedInput
                      id="channel-test_model-label"
                      label={customizeT(inputLabel.test_model)}
                      type="text"
                      disabled={hasTag}
                      value={values.test_model}
                      name="test_model"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      inputProps={{}}
                      aria-describedby="helper-text-channel-test_model-label"
                    />
                    {touched.test_model && errors.test_model ? (
                      <FormHelperText error id="helper-tex-channel-test_model-label">
                        {errors.test_model}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-test_model-label"> {customizeT(inputPrompt.test_model)} </FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.only_chat && (
                  <FormControl fullWidth>
                    <FormControlLabel
                      control={
                        <Switch
                          disabled={hasTag}
                          checked={Boolean(values.only_chat)}
                          onChange={(event) => {
                            setFieldValue('only_chat', event.target.checked);
                          }}
                        />
                      }
                      label={customizeT(inputLabel.only_chat)}
                    />
                    <FormHelperText id="helper-tex-only_chat_model-label"> {customizeT(inputPrompt.only_chat)} </FormHelperText>
                  </FormControl>
                )}
                {inputPrompt.pre_cost && (
                  <FormControl fullWidth error={Boolean(touched.pre_cost && errors.pre_cost)} sx={{ ...theme.typography.otherInput }}>
                    <InputLabel htmlFor="channel-pre_cost-label">{customizeT(inputLabel.pre_cost)}</InputLabel>
                    <Select
                      id="channel-pre_cost-label"
                      label={customizeT(inputLabel.pre_cost)}
                      value={values.pre_cost}
                      name="pre_cost"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      disabled={hasTag}
                      MenuProps={{
                        PaperProps: {
                          style: {
                            maxHeight: 200
                          }
                        }
                      }}
                    >
                      {PreCostType.map((option) => {
                        return (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        );
                      })}
                    </Select>
                    {touched.pre_cost && errors.pre_cost ? (
                      <FormHelperText error id="helper-tex-channel-pre_cost-label">
                        {errors.pre_cost}
                      </FormHelperText>
                    ) : (
                      <FormHelperText id="helper-tex-channel-pre_cost-label"> {customizeT(inputPrompt.pre_cost)} </FormHelperText>
                    )}
                  </FormControl>
                )}
                {inputPrompt.compatible_response && (
                  <FormControl fullWidth>
                    <FormControlLabel
                      control={
                        <Switch
                          disabled={hasTag}
                          checked={Boolean(values.compatible_response)}
                          onChange={(event) => {
                            setFieldValue('compatible_response', event.target.checked);
                          }}
                        />
                      }
                      label={customizeT(inputLabel.compatible_response)}
                    />
                    <FormHelperText id="helper-tex-compatible_response-label">{customizeT(inputPrompt.compatible_response)}</FormHelperText>
                  </FormControl>
                )}
                {pluginList[values.type] &&
                  Object.keys(pluginList[values.type]).map((pluginId) => {
                    const plugin = pluginList[values.type][pluginId];
                    return (
                      <>
                        <Box
                          sx={{
                            border: '1px solid #e0e0e0',
                            borderRadius: 2,
                            marginTop: 2,
                            marginBottom: 2,
                            overflow: 'hidden'
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: 2
                            }}
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="h3">{customizeT(plugin.name)}</Typography>
                              <Typography variant="caption">{customizeT(plugin.description)}</Typography>
                            </Box>
                            <Button
                              onClick={() => setExpanded(!expanded)}
                              endIcon={
                                expanded ? (
                                  <Icon icon="solar:alt-arrow-up-line-duotone" />
                                ) : (
                                  <Icon icon="solar:alt-arrow-down-line-duotone" />
                                )
                              }
                              sx={{ textTransform: 'none', marginLeft: 2 }}
                            >
                              {expanded ? t('channel_edit.collapse') : t('channel_edit.expand')}
                            </Button>
                          </Box>

                          <Collapse in={expanded}>
                            <Box sx={{ padding: 2, marginTop: -3 }}>
                              {Object.keys(plugin.params).map((paramId) => {
                                const param = plugin.params[paramId];
                                const name = `plugin.${pluginId}.${paramId}`;
                                return param.type === 'bool' ? (
                                  <FormControl key={name} fullWidth sx={{ ...theme.typography.otherInput }}>
                                    <FormControlLabel
                                      key={name}
                                      required
                                      control={
                                        <Switch
                                          key={name}
                                          name={name}
                                          disabled={hasTag}
                                          checked={values.plugin?.[pluginId]?.[paramId] || false}
                                          onChange={(event) => {
                                            setFieldValue(name, event.target.checked);
                                          }}
                                        />
                                      }
                                      label={t('channel_edit.isEnable')}
                                    />
                                    <FormHelperText id="helper-tex-channel-key-label"> {customizeT(param.description)} </FormHelperText>
                                  </FormControl>
                                ) : (
                                  <FormControl key={name} fullWidth sx={{ ...theme.typography.otherInput }}>
                                    <TextField
                                      multiline
                                      key={name}
                                      name={name}
                                      disabled={hasTag}
                                      value={values.plugin?.[pluginId]?.[paramId] || ''}
                                      label={customizeT(param.name)}
                                      placeholder={customizeT(param.description)}
                                      onChange={handleChange}
                                    />
                                    <FormHelperText id="helper-tex-channel-key-label"> {customizeT(param.description)} </FormHelperText>
                                  </FormControl>
                                );
                              })}
                            </Box>
                          </Collapse>
                        </Box>
                      </>
                    );
                  })}
                <DialogActions>
                  <Button onClick={onCancel}>{t('common.cancel')}</Button>
                  <Button disableElevation disabled={isSubmitting} type="submit" variant="contained" color="primary">
                    {t('common.submit')}
                  </Button>
                </DialogActions>
              </form>
            );
          }}
        </Formik>

        {/* 模型选择器弹窗 */}
        <ModelSelectorModal
          open={modelSelectorOpen}
          onClose={() => setModelSelectorOpen(false)}
          onConfirm={(selectedModels, mappings, overwriteModels, overwriteMappings) => {
            // 处理普通模型选择
            handleModelSelectorConfirm(selectedModels, overwriteModels);

            // 处理映射关系
            if (mappings && mappings.length > 0) {
              if (overwriteMappings) {
                // 覆盖映射模式：清空现有映射，使用新的
                tempSetFieldValue('model_mapping', mappings);
              } else {
                // 追加映射模式：
                const existingMappings = tempFormikValues?.model_mapping || [];
                const existingKeys = new Set(existingMappings.map((item) => item.key));
                const newMappings = mappings.filter((item) => !existingKeys.has(item.key));
                const mergedMappings = [...existingMappings, ...newMappings].map((item, index) => ({
                  ...item,
                  index
                }));
                tempSetFieldValue('model_mapping', mergedMappings);
              }
            }
          }}
          channelValues={tempFormikValues}
          prices={prices}
        />
      </DialogContent>
    </Dialog>
  );
};

export default EditModal;

EditModal.propTypes = {
  open: PropTypes.bool,
  channelId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onCancel: PropTypes.func,
  onOk: PropTypes.func,
  groupOptions: PropTypes.array,
  isTag: PropTypes.bool,
  modelOptions: PropTypes.array,
  prices: PropTypes.array
};
