import React from 'react'
import {definePlugin, defineField} from 'sanity'
import {internationalizedArray} from 'sanity-plugin-internationalized-array'
import {Stack} from '@sanity/ui'

import metadata from './schema/translation/metadata'
import MenuButton from './components/MenuButton'
import {PluginConfig} from './types'
import {LanguageBadge} from './badges'
import {METADATA_SCHEMA_NAME} from './constants'
import BulkPublish from './components/BulkPublish'

const DEFAULT_CONFIG = {
  supportedLanguages: [],
  schemaTypes: [],
  languageField: `language`,
  bulkPublish: false,
}

export const documentInternationalization = definePlugin<PluginConfig>((config) => {
  const {supportedLanguages, schemaTypes, languageField, bulkPublish} = {
    ...DEFAULT_CONFIG,
    ...config,
  }

  const renderLanguageFilter = (schemaType: string, documentId?: string) => {
    return (
      <MenuButton
        supportedLanguages={supportedLanguages}
        schemaType={schemaType}
        documentId={documentId ?? ``}
        languageField={languageField}
      />
    )
  }

  return {
    name: '@sanity/document-internationalization',

    // Adds:
    // - A bulk-publishing UI component to the form
    // - Will only work for projects on a compatible plan
    form: {
      components: {
        input: (props) => {
          if (
            bulkPublish &&
            props.id === 'root' &&
            props.schemaType.name === METADATA_SCHEMA_NAME
          ) {
            return (
              <Stack space={5}>
                <BulkPublish {...props} />
                {props.renderDefault(props)}
              </Stack>
            )
          }

          return props.renderDefault(props)
        },
      },
    },

    // Adds:
    // - The `Translations` dropdown to the editing form
    // - `Badges` to documents with a language value
    document: {
      unstable_languageFilter: (prev, ctx) => {
        const {schemaType, documentId} = ctx

        return schemaTypes.includes(schemaType)
          ? [...prev, () => renderLanguageFilter(schemaType, documentId)]
          : prev
      },
      badges: (prev, {schemaType}) => {
        if (!schemaTypes.includes(schemaType)) {
          return prev
        }

        return [(props) => LanguageBadge(props, supportedLanguages, languageField), ...prev]
      },
    },

    // Adds:
    // - The `Translations metadata` document type to the schema
    schema: {
      // Create the metadata document type
      types: [metadata(schemaTypes)],

      // For every schema type this plugin is enabled on
      // Create an initial value template to set the language
      templates: (prev, {schema}) => {
        const parameterizedTemplates = schemaTypes.map((schemaType) => ({
          id: `${schemaType}-parameterized`,
          title: `${schema?.get(schemaType)?.title ?? schemaType}: with Language`,
          schemaType,
          parameters: [{name: `languageId`, title: `Language ID`, type: `string`}],
          value: ({languageId}: {languageId: string}) => ({
            [languageField]: languageId,
          }),
        }))

        const staticTemplates = schemaTypes.flatMap((schemaType) => {
          return supportedLanguages.map((language) => ({
            id: `${schemaType}-${language.id}`,
            title: `${language.title} ${schema?.get(schemaType)?.title ?? schemaType}`,
            schemaType,
            value: {
              [languageField]: language.id,
            },
          }))
        })

        return [...prev, ...parameterizedTemplates, ...staticTemplates]
      },
    },

    // Uses:
    // - `sanity-plugin-internationalized-array` to maintain the translations array
    plugins: [
      // Translation metadata stores its references using this plugin
      // It cuts down on attribute usage and gives UI conveniences to add new translations
      internationalizedArray({
        languages: supportedLanguages,
        fieldTypes: [
          // TODO: The plugin should allow this kind of input
          // @ts-ignore
          defineField(
            {
              name: 'reference',
              type: 'reference',
              to: schemaTypes.map((type) => ({type: type})),
              // TODO: Add a validation rule to *ensure* the document's language matches the array key
              // Reference filters don't actually enforce validation!
              // validation: (Rule) => Rule.custom(),
              options: {
                collapsed: false,
                // TODO: Update type once it knows the values of this filter
                // @ts-ignore
                filter: ({parent, document}) => {
                  if (!parent) return null

                  // I'm not sure in what instance there's an array of parents
                  // But the Type suggests it's possible
                  const parentArray = Array.isArray(parent) ? parent : [parent]
                  const language = parentArray.find((p) => p._key)

                  if (!language?._key) return null

                  if (document.schemaTypes) {
                    return {
                      filter: `_type in $schemaTypes && ${languageField} == $language`,
                      params: {schemaTypes: document.schemaTypes, language: language._key},
                    }
                  }

                  return {
                    filter: `${languageField} == $language`,
                    params: {language: language._key},
                  }
                },
              },
            },
            {strict: false}
          ),
        ],
      }),
    ],
  }
})
